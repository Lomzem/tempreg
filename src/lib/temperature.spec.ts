import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import { parseTemperatureResponse } from './temperature';

const SAMPLE_RESPONSE = `w 5 23 [I] w, 0xf5 0x23
[I] w, 245 35
[I] Addr: 0xf5, value = 0x23
$> [I]
Sysmon widget at 00000200:
[I] 00: 47CFA461
[I] 01: 00009AFC
[I] 09: 00000000`;

describe('parseTemperatureResponse', () => {
	it('extracts the fourth and third characters from the end and calculates temperature', () => {
		const reading = Effect.runSync(parseTemperatureResponse(SAMPLE_RESPONSE));

		expect(reading).toEqual({
			extractedHex: 'A4',
			decimalValue: 164,
			temperatureC: 48.4
		});
	});

	it.each(['\n', '\r\n', '\r'])('supports %j line endings', (lineEnding) => {
		const response = ['[I] 00: 47CFA461', '[I] 09: 00000000'].join(lineEnding);

		expect(Effect.runSync(parseTemperatureResponse(response)).extractedHex).toBe('A4');
	});

	it('normalizes lowercase hexadecimal values', () => {
		const reading = Effect.runSync(parseTemperatureResponse('[I] 00: 47Cfa461'));

		expect(reading.extractedHex).toBe('A4');
	});

	it('handles UART spacing and ANSI color sequences around the register line', () => {
		const response =
			'\u001b[97m[I]   00:  48F9AD1F\r\n\u001b[0m\u001b[97m[I]   09:  00000000\r\n\u001b[0m';
		const reading = Effect.runSync(parseTemperatureResponse(response));

		expect(reading).toEqual({
			extractedHex: 'AD',
			decimalValue: 173,
			temperatureC: 66
		});
	});

	it('fails when the marker is absent', () => {
		const exit = Effect.runSyncExit(parseTemperatureResponse('[I] 01: 47CFA461'));

		expect(exit._tag).toBe('Failure');
	});

	it('fails when the extracted characters are not hexadecimal', () => {
		const exit = Effect.runSyncExit(parseTemperatureResponse('[I] 00: 47CFZZ61'));

		expect(exit._tag).toBe('Failure');
	});
});
