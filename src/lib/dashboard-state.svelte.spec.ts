import { Effect } from 'effect';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DashboardState } from './dashboard-state.svelte';
import { SerialReadError } from './serial/errors';
import type { SerialSession } from './serial/service';

const COMPLETE_RESPONSE = `[I]   00:  48F9AD1F
[I]   09:  00000000`;

const dashboards: DashboardState[] = [];

const createDashboard = (session: SerialSession): DashboardState => {
	const dashboard = new DashboardState();
	dashboard.session = session;
	dashboards.push(dashboard);
	return dashboard;
};

afterEach(() => {
	for (const dashboard of dashboards.splice(0)) dashboard.destroy();
	vi.restoreAllMocks();
});

describe('DashboardState command changes', () => {
	it('interrupts the pending command and restarts with the latest value', async () => {
		const commands: string[] = [];
		const session: SerialSession = {
			port: {} as SerialPort,
			transact: (command) => {
				commands.push(command);
				return command === 'new command' ? Effect.succeed(COMPLETE_RESPONSE) : Effect.never;
			},
			close: Effect.void
		};
		const dashboard = createDashboard(session);

		void dashboard.refresh();
		await vi.waitFor(() => expect(dashboard.busy).toBe(true));
		dashboard.setCommand('new command');

		expect(dashboard.busy).toBe(false);
		await vi.waitFor(() => expect(dashboard.temperatureC).toBe(66), { timeout: 1_000 });
		expect(commands).toEqual(['w f5 23', 'new command']);
	});
});

describe('DashboardState recording', () => {
	it('captures a successfully parsed temperature with a completion timestamp', async () => {
		const dashboard = createDashboard({
			port: {} as SerialPort,
			transact: () => Effect.succeed(COMPLETE_RESPONSE),
			close: Effect.void
		});
		dashboard.livePolling = true;
		const toISOString = vi
			.spyOn(Date.prototype, 'toISOString')
			.mockReturnValueOnce('2026-07-28T10:00:00.000Z')
			.mockReturnValueOnce('2026-07-28T10:00:01.000Z');

		expect(dashboard.startRecording()).toBe(true);
		await dashboard.refresh();

		expect(toISOString).toHaveBeenCalledTimes(2);
		expect(dashboard.recordedSamples).toEqual([
			{ timestamp: '2026-07-28T10:00:01.000Z', temperatureC: 66 }
		]);
	});

	it('enables live polling when a recording starts', () => {
		const dashboard = createDashboard({
			port: {} as SerialPort,
			transact: () => Effect.never,
			close: Effect.void
		});
		dashboard.livePolling = false;

		expect(dashboard.startRecording()).toBe(true);
		expect(dashboard.livePolling).toBe(true);
		expect(dashboard.recording).toBe(true);
	});

	it('does not include an in-flight read completed after recording stops', async () => {
		let complete!: (effect: Effect.Effect<string>) => void;
		const dashboard = createDashboard({
			port: {} as SerialPort,
			transact: () =>
				Effect.async<string>((resume) => {
					complete = resume;
				}),
			close: Effect.void
		});
		dashboard.livePolling = true;
		expect(dashboard.startRecording()).toBe(true);

		const refresh = dashboard.refresh();
		await vi.waitFor(() => expect(dashboard.busy).toBe(true));
		expect(dashboard.stopRecording()).toBe(true);
		complete(Effect.succeed(COMPLETE_RESPONSE));
		await refresh;

		expect(dashboard.recordedSamples).toEqual([]);
	});

	it('resets retained samples and the start time for a new session', () => {
		const dashboard = createDashboard({
			port: {} as SerialPort,
			transact: () => Effect.never,
			close: Effect.void
		});
		dashboard.livePolling = true;
		dashboard.recordedSamples = [{ timestamp: '2026-07-27T10:00:01.000Z', temperatureC: 12 }];
		dashboard.recordingStartedAt = '2026-07-27T10:00:00.000Z';
		vi.spyOn(Date.prototype, 'toISOString').mockReturnValue('2026-07-28T10:00:00.000Z');

		expect(dashboard.startRecording()).toBe(true);
		expect(dashboard.recordedSamples).toEqual([]);
		expect(dashboard.recordingStartedAt).toBe('2026-07-28T10:00:00.000Z');
	});

	it('finalizes an active recording after a read failure while retaining the session', async () => {
		const dashboard = createDashboard({
			port: {} as SerialPort,
			transact: () => Effect.fail(new SerialReadError({ message: 'Read failed.' })),
			close: Effect.void
		});
		dashboard.livePolling = true;
		dashboard.recordedSamples = [{ timestamp: '2026-07-28T10:00:01.000Z', temperatureC: 12 }];

		expect(dashboard.startRecording()).toBe(true);
		dashboard.recordedSamples = [{ timestamp: '2026-07-28T10:00:01.000Z', temperatureC: 12 }];
		await dashboard.refresh();

		expect(dashboard.recording).toBe(false);
		expect(dashboard.recordingStartedAt).toBeDefined();
		expect(dashboard.recordedSamples).toHaveLength(1);
	});
});
