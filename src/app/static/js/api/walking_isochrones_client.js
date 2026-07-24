export class WalkingIsochronesClient {
    async compute({ parkings, minutes }) {
        const response = await fetch("/api/walking-isochrones", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ parkings, minutes }),
        });

        if (!response.ok) {
            const detail = await response.json().catch(() => ({}));
            throw new Error(detail.detail ?? `HTTP ${response.status}`);
        }

        return response.json();
    }
}
