export class ParkingsClient {
    async find({ geometry }) {
        const response = await fetch("/api/parkings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ geometry }),
        });

        if (!response.ok) {
            const detail = await response.json().catch(() => ({}));
            throw new Error(detail.detail ?? `HTTP ${response.status}`);
        }

        return response.json();
    }
}
