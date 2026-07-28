<script lang="ts">
	import { onMount } from 'svelte';
	import { Cable, CircleAlert, Plus, RefreshCw, Unplug } from '@lucide/svelte';

	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import * as Select from '$lib/components/ui/select';
	import { Switch } from '$lib/components/ui/switch';
	import { DashboardState, setDashboardState } from '$lib/dashboard-state.svelte';

	const dashboard = new DashboardState();
	setDashboardState(dashboard);

	onMount(dashboard.initialize);

	const controlsDisabled = $derived(
		!dashboard.initialized || !dashboard.browserSupported || dashboard.busy
	);
	const isConnected = $derived(Boolean(dashboard.session));
	const selectedLabel = $derived(
		dashboard.authorizedPorts.find((entry) => entry.port === dashboard.selectedPort)?.label
	);
	const selectedPortValue = $derived.by(() => {
		const index = dashboard.authorizedPorts.findIndex(
			(entry) => entry.port === dashboard.selectedPort
		);
		return index >= 0 ? String(index) : undefined;
	});
</script>

<svelte:head>
	<title>Temperature Console</title>
	<meta
		name="description"
		content="Connect to a Web Serial temperature instrument and monitor its current reading."
	/>
</svelte:head>

<main class="min-h-screen bg-background">
	<div class="mx-auto flex w-full max-w-[100rem] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
		{#if dashboard.initialized && !dashboard.browserSupported}
			<Alert variant="destructive">
				<CircleAlert aria-hidden="true" />
				<AlertTitle>Web Serial is not available</AlertTitle>
				<AlertDescription
					>Use a Chromium-based browser on a secure HTTPS or localhost origin.</AlertDescription
				>
			</Alert>
		{:else if dashboard.error}
			<Alert variant="destructive">
				<CircleAlert aria-hidden="true" />
				<AlertTitle>Instrument notice</AlertTitle>
				<AlertDescription>{dashboard.error}</AlertDescription>
			</Alert>
		{/if}

		<Card class="overflow-hidden">
			<CardContent class="p-0">
				<div class="grid lg:grid-cols-2">
					<section class="border-b p-5 lg:border-r" aria-labelledby="devices-heading">
						<h2 id="devices-heading" class="mb-4 text-sm font-semibold">Devices</h2>
						<div class="grid items-end gap-3 sm:grid-cols-[minmax(14rem,1fr)_auto_auto]">
							<div class="grid gap-1.5">
								<label for="serial-device" class="text-xs font-medium text-muted-foreground"
									>Authorized device</label
								>
								<Select.Root
									type="single"
									value={selectedPortValue}
									disabled={controlsDisabled ||
										isConnected ||
										dashboard.authorizedPorts.length === 0}
									onValueChange={(value) =>
										dashboard.selectPort(dashboard.authorizedPorts[Number(value)]?.port)}
								>
									<Select.Trigger id="serial-device" class="w-full">
										{selectedLabel ?? 'No authorized devices'}
									</Select.Trigger>
									<Select.Content>
										{#each dashboard.authorizedPorts as entry, index (entry.port)}
											<Select.Item value={String(index)} label={entry.label} />
										{/each}
									</Select.Content>
								</Select.Root>
							</div>
							<Button
								variant="outline"
								disabled={controlsDisabled || isConnected}
								onclick={dashboard.addDevice}
							>
								<Plus class="size-4" /> Add device
							</Button>
							{#if isConnected}
								<Button variant="destructive" onclick={dashboard.disconnect}>
									<Unplug class="size-4" /> Disconnect
								</Button>
							{:else}
								<Button
									disabled={controlsDisabled || !dashboard.selectedPort}
									onclick={dashboard.connect}
								>
									<Cable class="size-4" /> Connect
								</Button>
							{/if}
						</div>
					</section>

					<section class="border-b p-5" aria-labelledby="polling-heading">
						<h2 id="polling-heading" class="mb-4 text-sm font-semibold">Live polling</h2>
						<div
							class="grid items-end gap-3 sm:grid-cols-[6rem_minmax(8rem,10rem)_auto] sm:justify-start"
						>
							<div class="grid gap-1.5">
								<label for="live-polling" class="text-xs font-medium text-muted-foreground"
									>Enabled</label
								>
								<div class="flex h-9 items-center">
									<Switch
										id="live-polling"
										checked={dashboard.livePolling}
										disabled={!isConnected || dashboard.connectionStatus === 'error'}
										onCheckedChange={dashboard.setLivePolling}
									/>
								</div>
							</div>
							<div class="grid gap-1.5">
								<label for="polling-interval" class="text-xs font-medium text-muted-foreground"
									>Interval (ms)</label
								>
								<Input
									id="polling-interval"
									type="number"
									min="100"
									step="100"
									value={dashboard.pollingInterval}
									disabled={!isConnected}
									onchange={(event) =>
										dashboard.setPollingInterval(event.currentTarget.valueAsNumber)}
								/>
							</div>
							<Button
								disabled={!isConnected || dashboard.busy || !dashboard.command.trim()}
								onclick={dashboard.refresh}
							>
								<RefreshCw class={['size-4', dashboard.busy && 'animate-spin']} /> Refresh
							</Button>
						</div>
					</section>
				</div>

				<div
					class="flex flex-col gap-2 bg-muted px-5 py-3 sm:flex-row sm:items-center sm:justify-between"
					aria-live="polite"
				>
					<div class="flex min-w-0 items-center gap-3">
						<Badge
							variant={isConnected ? 'default' : 'secondary'}
							class="shrink-0 gap-2 font-mono uppercase"
						>
							<span
								class={[
									'size-2 rounded-full',
									isConnected ? 'bg-emerald-300' : 'bg-muted-foreground/50'
								]}
							></span>
							{dashboard.connectionStatus}
						</Badge>
						<span class="truncate text-sm font-medium">{dashboard.status}</span>
					</div>
					{#if selectedLabel}
						<span class="truncate font-mono text-xs text-muted-foreground">{selectedLabel}</span>
					{/if}
				</div>
			</CardContent>
		</Card>

		<div class="mx-auto grid w-full max-w-2xl gap-2 py-1">
			<label for="uart-command" class="text-sm font-medium">Command</label>
			<Input
				id="uart-command"
				class="font-mono"
				value={dashboard.command}
				disabled={!dashboard.browserSupported}
				oninput={(event) => dashboard.setCommand(event.currentTarget.value)}
			/>
		</div>

		<Card class="overflow-hidden">
			<CardContent class="p-0">
				<div class="grid lg:grid-cols-[minmax(17rem,0.65fr)_minmax(0,1.35fr)]">
					<div class="grid border-b lg:border-r lg:border-b-0">
						<section class="border-b p-5" aria-label="Calculated temperature">
							<h2 class="text-sm font-semibold">Calculated temperature</h2>
							<div class="pt-8 pb-6">
								{#if dashboard.temperatureC !== undefined}
									<span
										class="font-mono text-5xl font-semibold tracking-tight tabular-nums sm:text-6xl"
									>
										{dashboard.temperatureC.toFixed(1)}
									</span>
									<span class="ml-2 text-xl text-muted-foreground">°C</span>
								{:else}
									<span class="font-mono text-5xl text-muted-foreground/40">--.-</span>
									<span class="ml-2 text-xl text-muted-foreground/50">°C</span>
								{/if}
							</div>
						</section>

						<section class="p-5" aria-label="Extracted value">
							<h2 class="text-sm font-semibold">Extracted value</h2>
							<div class="mt-5 flex items-end justify-between gap-6">
								<p class="font-mono text-4xl font-semibold tabular-nums">
									{dashboard.extractedByte ?? '--'}
								</p>
								<div class="text-right">
									<p class="text-xs text-muted-foreground">Decimal</p>
									<p class="mt-1 font-mono text-lg tabular-nums">{dashboard.decimalValue ?? '—'}</p>
								</div>
							</div>
						</section>
					</div>

					<section class="min-w-0 bg-zinc-950 text-zinc-100" aria-label="Latest UART printout">
						<div class="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
							<h2 class="font-mono text-xs font-medium tracking-wide text-zinc-400 uppercase">
								UART printout
							</h2>
							<span class="size-2 rounded-full bg-emerald-400/80"></span>
						</div>
						<ScrollArea class="h-80 lg:h-[clamp(24rem,48vh,34rem)]">
							<pre
								class="min-w-max p-5 font-mono text-xs leading-6 whitespace-pre text-zinc-300">{dashboard.latestResponse ??
									'Awaiting a complete response…'}</pre>
						</ScrollArea>
					</section>
				</div>
			</CardContent>
		</Card>
	</div>
</main>
