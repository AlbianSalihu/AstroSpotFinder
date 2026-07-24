export class LightPollutionClient {
    constructor({ baseUrl = "/api/light-pollution" } = {}) {
        this.baseUrl = baseUrl;
    }

    async getStatus() {
        const response = await fetch(`${this.baseUrl}/status`);

        if (!response.ok) {
            throw new Error("Could not fetch light pollution status.");
        }

        return response.json();
    }

    async download() {
        const response = await fetch(`${this.baseUrl}/download`, {
            method: "POST",
        });

        if (!response.ok) {
            throw new Error("Could not start download.");
        }

        return response.json();
    }

    async filter({ geometry, maxBortle }) {
        const response = await fetch(`${this.baseUrl}/filter`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                geometry,
                max_bortle: maxBortle,
            }),
        });

        if (!response.ok) {
            let message = "Light pollution filter failed.";

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
