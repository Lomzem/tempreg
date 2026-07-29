import { describe, expect, it } from 'vitest';

import { createTemperatureCsv, createTemperatureCsvFilename } from './recording';

describe('temperature recording CSV', () => {
	it('creates local timestamps in a parseable format', () => {
		const firstTimestamp = new Date(2026, 6, 28, 10, 0, 1, 123).toISOString();
		const secondTimestamp = new Date(2026, 6, 28, 10, 0, 2, 456).toISOString();

		expect(
			createTemperatureCsv([
				{ timestamp: firstTimestamp, temperatureC: 66 },
				{ timestamp: secondTimestamp, temperatureC: -3.25 }
			])
		).toBe(
			'timestamp,temperature_c\r\n' +
				'2026-07-28 10:00:01.123,66.0\r\n' +
				'2026-07-28 10:00:02.456,-3.3\r\n'
		);
	});

	it('creates a valid header-only CSV for a session without samples', () => {
		expect(createTemperatureCsv([])).toBe('timestamp,temperature_c\r\n');
	});

	it('creates a filesystem-safe filename from the session start time', () => {
		const startedAt = new Date(2026, 6, 28, 10, 0, 0, 123).toISOString();

		expect(createTemperatureCsvFilename(startedAt)).toBe(
			'temperature-session-2026-07-28_10-00-00-123.csv'
		);
	});
});
