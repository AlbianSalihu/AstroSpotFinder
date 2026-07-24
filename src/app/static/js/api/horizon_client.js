export class HorizonClient {
    constructor({ baseUrl = "/api/horizon" } = {}) {
        this.baseUrl = baseUrl;
    }

    async filter({ geometry, minSkyFraction }) {
        const response = await fetch(this.baseUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                geometry,
                min_sky_fraction: minSkyFraction,
            }),
        });

        if (!response.ok) {
            let message = "Horizon filter failed.";

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
