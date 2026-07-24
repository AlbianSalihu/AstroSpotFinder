export class IntersectClient {
    async intersect({ geometries }) {
        const response = await fetch("/api/intersect", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ geometries }),
        });

        if (!response.ok) {
            const detail = await response.json().catch(() => ({}));
            throw new Error(detail.detail ?? `HTTP ${response.status}`);
        }

        return response.json();
    }
}
