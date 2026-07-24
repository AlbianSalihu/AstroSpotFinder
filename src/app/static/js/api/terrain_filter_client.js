export class TerrainFilterClient {
    async filter({ geometry, buildupBufferM = 150 }) {
        const response = await fetch("/api/terrain-filter", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ geometry, buildup_buffer_m: buildupBufferM }),
        });

        if (!response.ok) {
            const detail = await response.json().catch(() => ({}));
            throw new Error(detail.detail ?? `HTTP ${response.status}`);
        }

        return response.json();
    }
}
