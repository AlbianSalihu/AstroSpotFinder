import { Pin } from "../../models/pin.js";


export class PinTool {
    constructor({
        mapView,
        onPinCreated
    }) {
        this.mapView = mapView;
        this.onPinCreated = onPinCreated;

        this.active = false;
        this.unsubscribeFromMapClick = null;
        this.stateListeners = new Set();
    }

    isActive() {
        return this.active;
    }

    activate() {
        if (this.active) {
            return;
        }

        this.active = true;
        this.mapView.setCursor("crosshair");

        this.unsubscribeFromMapClick =
            this.mapView.onClick((location) => {
                const pin = new Pin({
                    id: this.createPinId(),
                    location,
                    source: "map_click"
                });

                this.onPinCreated(pin);
                this.deactivate();
            });

        this.emitStateChanged();
    }

    deactivate() {
        if (!this.active) {
            return;
        }

        this.active = false;
        this.mapView.setCursor("");

        if (this.unsubscribeFromMapClick) {
            this.unsubscribeFromMapClick();
            this.unsubscribeFromMapClick = null;
        }

        this.emitStateChanged();
    }

    toggle() {
        if (this.active) {
            this.deactivate();
        } else {
            this.activate();
        }
    }

    onStateChanged(callback) {
        this.stateListeners.add(callback);

        return () => {
            this.stateListeners.delete(callback);
        };
    }

    emitStateChanged() {
        for (const callback of this.stateListeners) {
            callback(this.active);
        }
    }

    createPinId() {
        if (
            globalThis.crypto
            && typeof globalThis.crypto.randomUUID
                === "function"
        ) {
            return `pin-${globalThis.crypto.randomUUID()}`;
        }

        const timestamp = Date.now();
        const randomPart = Math.random()
            .toString(16)
            .slice(2);

        return `pin-${timestamp}-${randomPart}`;
    }
}