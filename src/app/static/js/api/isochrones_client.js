export class IsochronesClient {
    constructor({
        baseUrl = "/api/isochrones"
    } = {}) {
        this.baseUrl = baseUrl;
    }

    async compute({ location, minutes, mode }) {
        const response = await fetch(
            this.baseUrl,
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    location: {
                        latitude: location.latitude,
                        longitude: location.longitude,
                    },
                    minutes,
                    mode,
                }),
            }
        );

        if (!response.ok) {
            let message = "Isochrone computation failed.";

            try {
                const error = await response.json();
                if (typeof error.detail === "string") {
                    message = error.detail;
                }
            } catch {
                // Response did not contain JSON error data.
            }

            throw new Error(message);
        }

        return response.json();
    }
}
