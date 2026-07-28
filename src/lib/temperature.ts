import { Data, Effect } from 'effect';

const TEMPERATURE_LINE_MARKER = '[I] 00:';

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
		const line = response
			.split(/\r?\n|\r/)
			.find((candidate) => candidate.includes(TEMPERATURE_LINE_MARKER));

		if (!line) {
			return yield* new ResponseParseError({
				message: `Response does not contain ${TEMPERATURE_LINE_MARKER}`
			});
		}

		const normalizedLine = line.trimEnd();
		const extractedHex = normalizedLine.slice(-4, -2).toUpperCase();

		if (!/^[0-9A-F]{2}$/.test(extractedHex)) {
			return yield* new ResponseParseError({
				message: `Invalid temperature byte "${extractedHex || '(empty)'}"`
			});
		}

		const decimalValue = Number.parseInt(extractedHex, 16);
		const temperatureC = Math.round(((decimalValue * 502.9098) / 256 - 273.81) * 10) / 10;

		return { extractedHex, decimalValue, temperatureC };
	});
