export interface RecordedTemperatureSample {
	readonly timestamp: string;
	readonly temperatureC: number;
}

export const createTemperatureCsv = (samples: readonly RecordedTemperatureSample[]): string => {
	const rows = samples.map((sample) => `${sample.timestamp},${sample.temperatureC.toFixed(1)}`);
	return ['timestamp,temperature_c', ...rows].join('\r\n') + '\r\n';
};

export const createTemperatureCsvFilename = (startedAt: string): string =>
	`temperature-session-${startedAt.replace(/[:.]/g, '-')}.csv`;

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
