import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import { DashboardState } from './dashboard-state.svelte';
import type { SerialSession } from './serial/service';

const COMPLETE_RESPONSE = `[I]   00:  48F9AD1F
[I]   09:  00000000`;

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
		const dashboard = new DashboardState();
		dashboard.session = session;

		void dashboard.refresh();
		await vi.waitFor(() => expect(dashboard.busy).toBe(true));
		dashboard.setCommand('new command');

		expect(dashboard.busy).toBe(false);
		await vi.waitFor(() => expect(dashboard.temperatureC).toBe(66), { timeout: 1_000 });
		expect(commands).toEqual(['w f5 23', 'new command']);
		dashboard.destroy();
	});
});
