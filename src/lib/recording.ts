export interface RecordedTemperatureSample {
	readonly timestamp: string;
	readonly temperatureC: number;
}

const formatLocalTimestamp = (timestamp: string): string => {
	const date = new Date(timestamp);
	const pad = (value: number, length = 2) => value.toString().padStart(length, '0');

	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
};

export const createTemperatureCsv = (samples: readonly RecordedTemperatureSample[]): string => {
	const rows = samples.map(
		(sample) => `${formatLocalTimestamp(sample.timestamp)},${sample.temperatureC.toFixed(1)}`
	);
	return ['timestamp,temperature_c', ...rows].join('\r\n') + '\r\n';
};

export const createTemperatureCsvFilename = (startedAt: string): string =>
	`temperature-session-${formatLocalTimestamp(startedAt).replace(' ', '_').replace(/[:.]/g, '-')}.csv`;

export const downloadTemperatureCsv = (csv: string, filename: string): void => {
	const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	link.hidden = true;
	document.body.append(link);
	link.click();
	link.remove();
	URL.revokeObjectURL(url);
};
