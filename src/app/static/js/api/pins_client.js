import { Location } from "../models/location.js";
import { Pin } from "../models/pin.js";


export class PinsClient {
    constructor({
        baseUrl = "/api/pins"
    } = {}) {
        this.baseUrl = baseUrl;
    }

    async listPins() {
        const response = await fetch(this.baseUrl);

        await this.ensureSuccessfulResponse(
            response,
            "Unable to load saved pins."
        );

        const data = await response.json();

        if (!Array.isArray(data)) {
            throw new TypeError(
                "The pins API returned an invalid response."
            );
        }

        return data.map((pinData) => {
            return this.deserializePin(pinData);
        });
    }

    async createPin(pin) {
        if (!(pin instanceof Pin)) {
            throw new TypeError(
                "createPin() requires a Pin model."
            );
        }

        const response = await fetch(
            this.baseUrl,
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify(
                    this.serializePin(pin)
                )
            }
        );

        await this.ensureSuccessfulResponse(
            response,
            "Unable to save the pin."
        );

        const data = await response.json();

        return this.deserializePin(data);
    }

    async updatePin(pinId, { label }) {
        const response = await fetch(
            `${this.baseUrl}/${encodeURIComponent(pinId)}`,
            {
                method: "PATCH",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({ label }),
            }
        );

        await this.ensureSuccessfulResponse(
            response,
            "Unable to update the pin."
        );

        const data = await response.json();

        return this.deserializePin(data);
    }

    async deletePin(pinId) {
        const response = await fetch(
            `${this.baseUrl}/${encodeURIComponent(pinId)}`,
            {
                method: "DELETE"
            }
        );

        await this.ensureSuccessfulResponse(
            response,
            "Unable to delete the pin."
        );
    }

    serializePin(pin) {
        return {
            id: pin.id,

            location: {
                latitude: pin.location.latitude,
                longitude: pin.location.longitude
            },

            source: pin.source,
            label: pin.label
        };
    }

    deserializePin(data) {
        if (
            data === null
            || typeof data !== "object"
        ) {
            throw new TypeError(
                "Invalid pin data received from the API."
            );
        }

        return new Pin({
            id: data.id,

            location: new Location({
                latitude: data.location.latitude,
                longitude: data.location.longitude
            }),

            source: data.source,
            label: data.label
        });
    }

    async ensureSuccessfulResponse(
        response,
        fallbackMessage
    ) {
        if (response.ok) {
            return;
        }

        let message = fallbackMessage;

        try {
            const errorData = await response.json();

            if (
                typeof errorData.detail === "string"
                && errorData.detail !== ""
            ) {
                message = errorData.detail;
            }
        } catch {
            // The response did not contain JSON error data.
        }

        throw new Error(message);
    }
}