import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import { openSerialSession, SERIAL_OPTIONS, stripAnsiSequences } from './service';

const COMPLETE_RESPONSE = `[I] 00: 47CFA461
[I] 01: 00009AFC
[I] 09: 00000000`;

const makePort = (
	onWrite: (command: string, controller: ReadableStreamDefaultController<Uint8Array>) => void
) => {
	let controller!: ReadableStreamDefaultController<Uint8Array>;
	const open = vi.fn(async () => undefined);
	const close = vi.fn(async () => undefined);
	const readable = new ReadableStream<Uint8Array>({
		start(streamController) {
			controller = streamController;
		}
	});
	const writable = new WritableStream<Uint8Array>({
		write(chunk) {
			onWrite(new TextDecoder().decode(chunk), controller);
		}
	});

	const port = {
		open,
		close,
		readable,
		writable,
		getInfo: () => ({ usbVendorId: 0x1234, usbProductId: 0xabcd })
	} as unknown as SerialPort;

	return { port, open, close };
};

describe('openSerialSession', () => {
	it('removes ANSI terminal formatting from UART output', () => {
		expect(stripAnsiSequences('\u001b[97m[I]   00:  48F9AD1F\u001b[0m')).toBe(
			'[I]   00:  48F9AD1F'
		);
	});

	it('opens with fixed 115200 8N1 settings and appends a carriage return', async () => {
		const writes: string[] = [];
		const encoder = new TextEncoder();
		const { port, open } = makePort((command, controller) => {
			writes.push(command);
			controller.enqueue(encoder.encode(COMPLETE_RESPONSE));
		});
		const session = await Effect.runPromise(openSerialSession(port));

		const response = await Effect.runPromise(session.transact('w f5 23'));

		expect(open).toHaveBeenCalledWith(SERIAL_OPTIONS);
		expect(writes).toEqual(['w f5 23\r']);
		expect(response).toBe(COMPLETE_RESPONSE);
		await Effect.runPromise(session.close);
	});

	it('assembles split chunks before publishing a complete response', async () => {
		const encoder = new TextEncoder();
		const { port } = makePort((_command, controller) => {
			controller.enqueue(encoder.encode('[I] 00: 47CF'));
			controller.enqueue(encoder.encode('A461\n[I] 09: 00000000'));
		});
		const session = await Effect.runPromise(openSerialSession(port));

		await expect(Effect.runPromise(session.transact('w f5 23'))).resolves.toContain(
			'[I] 00: 47CFA461'
		);
		await Effect.runPromise(session.close);
	});

	it('keeps a partial response alive across a short processing pause', async () => {
		const writes: string[] = [];
		const progress: string[] = [];
		const encoder = new TextEncoder();
		const { port } = makePort((command, controller) => {
			writes.push(command);
			controller.enqueue(encoder.encode('[I] 00: 47CFA461\n'));
			setTimeout(() => controller.enqueue(encoder.encode('[I] 09:')), 150);
		});
		const session = await Effect.runPromise(openSerialSession(port));

		const response = await Effect.runPromise(
			session.transact('w f5 23', (partial) => progress.push(partial))
		);

		expect(writes).toEqual(['w f5 23\r']);
		expect(progress[0]).toBe('[I] 00: 47CFA461\n');
		expect(response).toContain('[I] 09:');
		await Effect.runPromise(session.close);
	});

	it('keeps discarding partial attempts until a complete response arrives', async () => {
		const writes: string[] = [];
		const encoder = new TextEncoder();
		const { port } = makePort((command, controller) => {
			writes.push(command);
			controller.enqueue(encoder.encode(writes.length < 5 ? '[I] 00: PARTIAL' : COMPLETE_RESPONSE));
		});
		const session = await Effect.runPromise(openSerialSession(port));

		const response = await Effect.runPromise(session.transact('w f5 23'));

		expect(writes).toEqual(Array.from({ length: 5 }, () => 'w f5 23\r'));
		expect(response).toBe(COMPLETE_RESPONSE);
		await Effect.runPromise(session.close);
	});
});
