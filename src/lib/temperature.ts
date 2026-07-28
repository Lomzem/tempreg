import { Data, Effect } from 'effect';

const TEMPERATURE_REGISTER_PATTERN = /\[I\]\s+00:\s*([0-9A-Fa-f]{8})(?![0-9A-Za-z])/;

export interface TemperatureReading {
	extractedHex: string;
	decimalValue: number;
	temperatureC: number;
}

export class ResponseParseError extends Data.TaggedError('ResponseParseError')<{
	message: string;
}> {}

export const parseTemperatureResponse = (
	response: string
): Effect.Effect<TemperatureReading, ResponseParseError> =>
	Effect.gen(function* () {
		const registerMatch = TEMPERATURE_REGISTER_PATTERN.exec(response);

		if (!registerMatch) {
			return yield* new ResponseParseError({
				message: 'Response does not contain a valid [I] 00: register value'
			});
		}

		const registerValue = registerMatch[1];
		const extractedHex = registerValue.slice(-4, -2).toUpperCase();

		if (!/^[0-9A-F]{2}$/.test(extractedHex)) {
			return yield* new ResponseParseError({
				message: `Invalid temperature byte "${extractedHex || '(empty)'}"`
			});
		}

		const decimalValue = Number.parseInt(extractedHex, 16);
		const temperatureC = Math.round(((decimalValue * 502.9098) / 256 - 273.81) * 10) / 10;

		return { extractedHex, decimalValue, temperatureC };
	});
