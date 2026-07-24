import { MapObject } from "../map_object.js";
import { Pin } from "../../models/pin.js";


export class PinMarker extends MapObject {
    constructor({
        pin,
        variant = "default"
    }) {
        if (!(pin instanceof Pin)) {
            throw new TypeError(
                "PinMarker requires a Pin model."
            );
        }

        super(pin.id);

        this.pin = pin;
        this.variant = variant;

        this.marker = null;
        this.element = null;

        this.clickListeners = new Set();
    }

    attach(mapView) {
        if (this.marker !== null) {
            throw new Error(
                `PinMarker "${this.id}" is already attached.`
            );
        }

        this.element = this.createElement();

        this.marker = mapView.createMarker({
            element: this.element,
            location: this.pin.location,
            anchor: "bottom"
        });
    }

    createElement() {
        const element = document.createElement("button");

        element.type = "button";

        element.classList.add(
            "astro-pin-marker",
            `astro-pin-marker--${this.variant}`
        );

        element.setAttribute(
            "aria-label",
            this.pin.label ?? "Map pin"
        );

        element.setAttribute(
            "aria-pressed",
            "false"
        );

        element.title = this.pin.label ?? "Map pin";

        const shape = document.createElement("span");

        shape.className = "astro-pin-marker__shape";
        shape.setAttribute("aria-hidden", "true");

        element.appendChild(shape);

        element.addEventListener("click", (event) => {
            event.stopPropagation();
            this.emitClick();
        });

        return element;
    }

    onClick(callback) {
        this.clickListeners.add(callback);

        return () => {
            this.clickListeners.delete(callback);
        };
    }

    emitClick() {
        for (const callback of this.clickListeners) {
            callback(this.pin);
        }
    }

    updatePin(newPin) {
        this.pin = newPin;

        if (this.element) {
            const label = newPin.label ?? "Map pin";
            this.element.setAttribute("aria-label", label);
            this.element.title = label;
        }
    }

    setSelected(isSelected) {
        if (this.element === null) {
            return;
        }

        this.element.classList.toggle(
            "astro-pin-marker--selected",
            isSelected
        );

        this.element.setAttribute(
            "aria-pressed",
            String(isSelected)
        );
    }

    detach() {
        if (this.marker === null) {
            return;
        }

        this.marker.remove();

        this.marker = null;
        this.element = null;
    }
}