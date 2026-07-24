export class LocalHorizonClient {
    async filter({ geometry, minSkyFraction }) {
        const response = await fetch("/api/local-horizon/filter", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                geometry,
                min_sky_fraction: minSkyFraction,
            }),
        });

        if (!response.ok) {
            const detail = await response.json().catch(() => ({}));
            throw new Error(detail.detail ?? `HTTP ${response.status}`);
        }

        return response.json();
    }
}
