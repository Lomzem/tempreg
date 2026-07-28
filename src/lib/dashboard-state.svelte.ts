import { Effect } from 'effect';
import { createContext } from 'svelte';

import {
	getAuthorizedPorts,
	openSerialSession,
	requestPort,
	serialPortLabel,
	type SerialSession
} from '$lib/serial/service';
import { parseTemperatureResponse } from '$lib/temperature';

const COMMAND_STORAGE_KEY = 'tempreg.uart-command';

export type ConnectionStatus =
	'disconnected' | 'connecting' | 'connected' | 'disconnecting' | 'error';

export interface AuthorizedPort {
	readonly port: SerialPort;
	readonly label: string;
}

type EffectResult<A> =
	{ readonly ok: true; readonly value: A } | { readonly ok: false; readonly error: string };

export class DashboardState {
	browserSupported = $state(false);
	initialized = $state(false);
	authorizedPorts = $state.raw<AuthorizedPort[]>([]);
	selectedPort = $state.raw<SerialPort | undefined>(undefined);
	session = $state.raw<SerialSession | undefined>(undefined);
	connectionStatus = $state<ConnectionStatus>('disconnected');
	command = $state('w f5 23');
	pollingInterval = $state(1000);
	livePolling = $state(false);
	busy = $state(false);
	latestResponse = $state.raw<string | undefined>(undefined);
	extractedByte = $state<string | undefined>(undefined);
	decimalValue = $state<number | undefined>(undefined);
	temperatureC = $state<number | undefined>(undefined);
	error = $state<string | undefined>(undefined);
	status = $state('Waiting for browser initialization.');

	private pollTimer: ReturnType<typeof setTimeout> | undefined;
	private disposed = false;
	private serial: Serial | undefined;

	private runEffect = async <A, E extends { message: string }>(
		effect: Effect.Effect<A, E>
	): Promise<EffectResult<A>> =>
		Effect.runPromise(
			effect.pipe(
				Effect.match({
					onFailure: (failure) => ({ ok: false, error: failure.message }) as const,
					onSuccess: (value) => ({ ok: true, value }) as const
				})
			)
		);

	initialize = (): (() => void) => {
		this.disposed = false;
		this.browserSupported = 'serial' in navigator;

		if (!this.browserSupported) {
			this.initialized = true;
			this.connectionStatus = 'error';
			this.error = 'Web Serial is unavailable. Use a Chromium-based browser in a secure context.';
			this.status = 'Browser unsupported';
			return this.destroy;
		}

		this.command = localStorage.getItem(COMMAND_STORAGE_KEY) || this.command;
		this.serial = navigator.serial;
		this.serial.addEventListener('disconnect', this.handlePhysicalDisconnect);
		void this.loadAuthorizedPorts();
		return this.destroy;
	};

	private loadAuthorizedPorts = async () => {
		const result = await this.runEffect(getAuthorizedPorts());
		if (this.disposed) return;

		this.initialized = true;
		if (!result.ok) {
			this.connectionStatus = 'error';
			this.error = result.error;
			this.status = 'Could not load devices';
			return;
		}

		this.authorizedPorts = result.value.map((port, index) => ({
			port,
			label: serialPortLabel(port, index)
		}));
		if (!this.selectedPort || !result.value.includes(this.selectedPort)) {
			this.selectedPort = result.value[0];
		}
		this.error = undefined;
		this.status = result.value.length ? 'Device ready to connect' : 'No authorized devices';
	};

	setCommand = (command: string) => {
		this.command = command;
		localStorage.setItem(COMMAND_STORAGE_KEY, command);
	};

	setPollingInterval = (interval: number | undefined) => {
		if (interval === undefined || !Number.isFinite(interval)) return;
		this.pollingInterval = Math.max(100, Math.round(interval));
		if (this.livePolling && this.session && !this.busy) this.schedulePoll();
	};

	selectPort = (port: SerialPort | undefined) => {
		if (!this.session) this.selectedPort = port;
	};

	addDevice = async () => {
		if (!this.browserSupported || this.busy) return;
		this.busy = true;
		this.error = undefined;
		this.status = 'Waiting for device selection…';
		const result = await this.runEffect(requestPort());
		this.busy = false;
		if (this.disposed) return;
		if (!result.ok) {
			this.error = result.error;
			this.status = 'Device was not added';
			return;
		}

		this.selectedPort = result.value;
		await this.loadAuthorizedPorts();
		this.selectedPort = result.value;
		this.status = 'Device added';
	};

	connect = async () => {
		if (!this.selectedPort || this.session || this.busy) return;
		this.connectionStatus = 'connecting';
		this.busy = true;
		this.error = undefined;
		this.status = 'Opening serial connection…';
		const result = await this.runEffect(openSerialSession(this.selectedPort));
		this.busy = false;
		if (this.disposed) {
			if (result.ok) void Effect.runPromise(result.value.close.pipe(Effect.ignore));
			return;
		}
		if (!result.ok) {
			this.connectionStatus = 'error';
			this.error = result.error;
			this.status = 'Connection failed';
			return;
		}

		this.session = result.value;
		this.connectionStatus = 'connected';
		this.status = 'Connected';
	};

	disconnect = async () => {
		this.stopPolling();
		const activeSession = this.session;
		this.session = undefined;
		if (!activeSession) {
			this.connectionStatus = 'disconnected';
			return;
		}

		this.connectionStatus = 'disconnecting';
		this.busy = true;
		const result = await this.runEffect(activeSession.close);
		this.busy = false;
		if (this.disposed) return;
		this.connectionStatus = result.ok ? 'disconnected' : 'error';
		this.error = result.ok ? undefined : result.error;
		this.status = result.ok ? 'Disconnected' : 'Disconnect failed';
	};

	refresh = async () => {
		this.clearPollTimer();
		const succeeded = await this.performRefresh();
		if (succeeded && this.livePolling && this.session) this.schedulePoll();
	};

	private performRefresh = async (): Promise<boolean> => {
		const activeSession = this.session;
		const command = this.command.trim();
		if (!activeSession || this.busy || !command) return false;

		this.busy = true;
		this.error = undefined;
		this.status = 'Reading temperature…';
		const transaction = await this.runEffect(activeSession.transact(command));
		if (this.disposed || this.session !== activeSession) {
			this.busy = false;
			return false;
		}

		if (!transaction.ok) {
			this.busy = false;
			this.stopPolling();
			this.connectionStatus = 'error';
			this.error = transaction.error;
			this.status = 'Read failed';
			return false;
		}

		this.latestResponse = transaction.value;
		const parsed = await this.runEffect(parseTemperatureResponse(transaction.value));
		this.busy = false;
		if (!parsed.ok) {
			this.stopPolling();
			this.connectionStatus = 'error';
			this.error = parsed.error;
			this.status = 'Response parse failed';
			return false;
		}

		this.extractedByte = parsed.value.extractedHex;
		this.decimalValue = parsed.value.decimalValue;
		this.temperatureC = parsed.value.temperatureC;
		this.connectionStatus = 'connected';
		this.status = 'Reading current';
		return true;
	};

	setLivePolling = (enabled: boolean) => {
		if (!enabled) {
			this.stopPolling();
			return;
		}
		if (!this.session || this.livePolling) return;
		this.livePolling = true;
		void this.refresh();
	};

	private schedulePoll = () => {
		this.clearPollTimer();
		if (!this.livePolling || !this.session || this.disposed) return;
		this.pollTimer = setTimeout(() => void this.refresh(), this.pollingInterval);
	};

	private clearPollTimer = () => {
		if (this.pollTimer !== undefined) clearTimeout(this.pollTimer);
		this.pollTimer = undefined;
	};

	private stopPolling = () => {
		this.livePolling = false;
		this.clearPollTimer();
	};

	private handlePhysicalDisconnect = () => {
		const activeSession = this.session;
		if (!activeSession || activeSession.port.connected) return;
		this.stopPolling();
		this.session = undefined;
		this.connectionStatus = 'disconnected';
		this.error = 'The serial device was disconnected.';
		this.status = 'Device disconnected';
		void this.loadAuthorizedPorts();
	};

	destroy = () => {
		if (this.disposed) return;
		this.disposed = true;
		this.stopPolling();
		this.serial?.removeEventListener('disconnect', this.handlePhysicalDisconnect);
		this.serial = undefined;
		const activeSession = this.session;
		this.session = undefined;
		if (activeSession) void Effect.runPromise(activeSession.close.pipe(Effect.ignore));
	};
}

export const [getDashboardState, setDashboardState] = createContext<DashboardState>();
