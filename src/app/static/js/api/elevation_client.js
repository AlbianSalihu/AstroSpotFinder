export class ElevationClient {
    constructor({ baseUrl = "/api/elevation" } = {}) {
        this.baseUrl = baseUrl;
    }

    async filter({ geometry, minElevation }) {
        const response = await fetch(this.baseUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                geometry,
                min_elevation: minElevation,
            }),
        });

        if (!response.ok) {
            let message = "Elevation filter failed.";

            try {
                const error = await response.json();
                if (typeof error.detail === "string") {
                    message = error.detail;
                }
            } catch {
                // no JSON body
            }

            throw new Error(message);
        }

        return response.json();
    }
}
