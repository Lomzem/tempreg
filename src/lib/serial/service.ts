import { Effect } from 'effect';

import {
	SerialConnectionError,
	SerialReadError,
	SerialUnsupportedError,
	SerialWriteError,
	type SerialError
} from './errors';

export const SERIAL_OPTIONS: SerialOptions = {
	baudRate: 115_200,
	dataBits: 8,
	stopBits: 1,
	parity: 'none'
};

export const RESPONSE_IDLE_TIMEOUT_MS = 100;
export const PARTIAL_RESPONSE_IDLE_TIMEOUT_MS = 1_000;

const COMPLETE_RESPONSE_PATTERN = /\[I\]\s+09:/;

type InboxResult =
	{ readonly _tag: 'Chunk'; readonly value: string } | { readonly _tag: 'Timeout' };

class ChunkInbox {
	private chunks: string[] = [];
	private waiters = new Set<(result: InboxResult) => void>();
	private failure: SerialReadError | undefined;

	push(chunk: string) {
		const waiter = this.waiters.values().next().value;
		if (waiter) {
			this.waiters.delete(waiter);
			waiter({ _tag: 'Chunk', value: chunk });
			return;
		}
		this.chunks.push(chunk);
	}

	fail(error: SerialReadError) {
		this.failure = error;
		for (const waiter of this.waiters) waiter({ _tag: 'Timeout' });
		this.waiters.clear();
	}

	clear() {
		this.chunks = [];
	}

	take(timeoutMs: number): Promise<InboxResult> {
		if (this.failure) return Promise.reject(this.failure);
		const chunk = this.chunks.shift();
		if (chunk !== undefined) return Promise.resolve({ _tag: 'Chunk', value: chunk });

		return new Promise((resolve) => {
			const waiter = (result: InboxResult) => {
				clearTimeout(timer);
				resolve(result);
			};
			const timer = setTimeout(() => {
				this.waiters.delete(waiter);
				resolve({ _tag: 'Timeout' });
			}, timeoutMs);
			this.waiters.add(waiter);
		});
	}
}

export interface SerialSession {
	readonly port: SerialPort;
	readonly transact: (
		command: string,
		onProgress?: (response: string) => void
	) => Effect.Effect<string, SerialError>;
	readonly close: Effect.Effect<void, SerialConnectionError>;
}

const serialApi = (): Effect.Effect<Serial, SerialUnsupportedError> =>
	Effect.try({
		try: () => navigator.serial,
		catch: () =>
			new SerialUnsupportedError({
				message: 'Web Serial is unavailable. Use a Chromium-based browser in a secure context.'
			})
	}).pipe(
		Effect.flatMap((serial) =>
			serial
				? Effect.succeed(serial)
				: Effect.fail(
						new SerialUnsupportedError({
							message:
								'Web Serial is unavailable. Use a Chromium-based browser in a secure context.'
						})
					)
		)
	);

export const getAuthorizedPorts = (): Effect.Effect<SerialPort[], SerialError> =>
	Effect.gen(function* () {
		const serial = yield* serialApi();
		return yield* Effect.tryPromise({
			try: () => serial.getPorts(),
			catch: (cause) =>
				new SerialConnectionError({ message: 'Could not list serial devices.', cause })
		});
	});

export const requestPort = (): Effect.Effect<SerialPort, SerialError> =>
	Effect.gen(function* () {
		const serial = yield* serialApi();
		return yield* Effect.tryPromise({
			try: () => serial.requestPort(),
			catch: (cause) =>
				new SerialConnectionError({ message: 'Serial device selection was cancelled.', cause })
		});
	});

export const openSerialSession = (port: SerialPort): Effect.Effect<SerialSession, SerialError> =>
	Effect.gen(function* () {
		yield* Effect.tryPromise({
			try: () => port.open(SERIAL_OPTIONS),
			catch: (cause) =>
				new SerialConnectionError({ message: 'Could not open the serial device.', cause })
		});

		if (!port.readable || !port.writable) {
			yield* Effect.tryPromise({
				try: () => port.close(),
				catch: (cause) =>
					new SerialConnectionError({ message: 'Could not close the serial device.', cause })
			}).pipe(Effect.ignore);
			return yield* new SerialConnectionError({
				message: 'The serial device has no readable or writable stream.'
			});
		}

		const reader = port.readable.getReader();
		const writer = port.writable.getWriter();
		const decoder = new TextDecoder();
		const encoder = new TextEncoder();
		const inbox = new ChunkInbox();
		const semaphore = yield* Effect.makeSemaphore(1);
		let closing = false;

		const readPump = async () => {
			try {
				while (!closing) {
					const { value, done } = await reader.read();
					if (done) break;
					if (value) inbox.push(decoder.decode(value, { stream: true }));
				}
			} catch (cause) {
				if (!closing)
					inbox.fail(
						new SerialReadError({ message: 'The serial device stopped responding.', cause })
					);
			}
		};
		void readPump();

		const runTransaction = (
			command: string,
			onProgress?: (response: string) => void
		): Effect.Effect<string, SerialError> =>
			Effect.gen(function* () {
				while (true) {
					inbox.clear();
					yield* Effect.tryPromise({
						try: () => writer.write(encoder.encode(`${command}\r`)),
						catch: (cause) =>
							new SerialWriteError({ message: 'Could not write the UART command.', cause })
					});

					let response = '';
					while (true) {
						const result = yield* Effect.tryPromise({
							try: () =>
								inbox.take(response ? PARTIAL_RESPONSE_IDLE_TIMEOUT_MS : RESPONSE_IDLE_TIMEOUT_MS),
							catch: (cause) =>
								cause instanceof SerialReadError
									? cause
									: new SerialReadError({ message: 'Could not read the UART response.', cause })
						});

						if (result._tag === 'Timeout') break;

						response += result.value;
						onProgress?.(response);
						if (COMPLETE_RESPONSE_PATTERN.test(response)) return response.trimEnd();
					}
				}
			});

		const transact = (command: string, onProgress?: (response: string) => void) =>
			semaphore.withPermits(1)(runTransaction(command, onProgress));
		const close = Effect.tryPromise({
			try: async () => {
				closing = true;
				await reader.cancel().catch(() => undefined);
				reader.releaseLock();
				writer.releaseLock();
				await port.close();
			},
			catch: (cause) =>
				new SerialConnectionError({ message: 'Could not close the serial device cleanly.', cause })
		});

		return { port, transact, close };
	});

export const serialPortLabel = (port: SerialPort, index: number): string => {
	const { usbProductId, usbVendorId } = port.getInfo();
	if (usbVendorId === undefined && usbProductId === undefined) return `Serial device ${index + 1}`;
	const vendor = usbVendorId?.toString(16).toUpperCase().padStart(4, '0') ?? '----';
	const product = usbProductId?.toString(16).toUpperCase().padStart(4, '0') ?? '----';
	return `USB ${vendor}:${product}`;
};
