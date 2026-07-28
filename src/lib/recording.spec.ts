import { describe, expect, it } from 'vitest';

import { createTemperatureCsv, createTemperatureCsvFilename } from './recording';

describe('temperature recording CSV', () => {
	it('creates timestamped temperature rows with stable formatting', () => {
		expect(
			createTemperatureCsv([
				{ timestamp: '2026-07-28T10:00:01.123Z', temperatureC: 66 },
				{ timestamp: '2026-07-28T10:00:02.456Z', temperatureC: -3.25 }
			])
		).toBe(
			'timestamp,temperature_c\r\n' +
				'2026-07-28T10:00:01.123Z,66.0\r\n' +
				'2026-07-28T10:00:02.456Z,-3.3\r\n'
		);
	});

	it('creates a valid header-only CSV for a session without samples', () => {
		expect(createTemperatureCsv([])).toBe('timestamp,temperature_c\r\n');
	});

	it('creates a filesystem-safe filename from the session start time', () => {
		expect(createTemperatureCsvFilename('2026-07-28T10:00:00.123Z')).toBe(
			'temperature-session-2026-07-28T10-00-00-123Z.csv'
		);
	});
});
