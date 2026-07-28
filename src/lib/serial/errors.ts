import { Data } from 'effect';

export class SerialUnsupportedError extends Data.TaggedError('SerialUnsupportedError')<{
	message: string;
}> {}

export class SerialConnectionError extends Data.TaggedError('SerialConnectionError')<{
	message: string;
	cause?: unknown;
}> {}

export class SerialReadError extends Data.TaggedError('SerialReadError')<{
	message: string;
	cause?: unknown;
}> {}

export class SerialWriteError extends Data.TaggedError('SerialWriteError')<{
	message: string;
	cause?: unknown;
}> {}

export type SerialError =
	SerialUnsupportedError | SerialConnectionError | SerialReadError | SerialWriteError;
