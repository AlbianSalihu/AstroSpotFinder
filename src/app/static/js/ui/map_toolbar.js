export class MapToolbar {
    constructor({
        mountPoint = document.body
    } = {}) {
        this.element = document.createElement("div");
        this.element.className = "map-toolbar";

        this.buttons = new Map();
        this.toolSelectedListeners = new Set();

        mountPoint.appendChild(this.element);
    }

    addTool({
        id,
        label,
        icon
    }) {
        if (this.buttons.has(id)) {
            throw new Error(
                `Toolbar tool "${id}" already exists.`
            );
        }

        const button = document.createElement("button");

        button.type = "button";
        button.className = "map-toolbar__button";

        button.setAttribute("aria-label", label);
        button.setAttribute("aria-pressed", "false");

        button.title = label;

        const iconElement = document.createElement("span");

        iconElement.className = "map-toolbar__icon";
        iconElement.textContent = icon;
        iconElement.setAttribute("aria-hidden", "true");

        button.appendChild(iconElement);

        button.addEventListener("click", () => {
            this.emitToolSelected(id);
        });

        this.element.appendChild(button);
        this.buttons.set(id, button);
    }

    onToolSelected(callback) {
        this.toolSelectedListeners.add(callback);

        return () => {
            this.toolSelectedListeners.delete(callback);
        };
    }

    emitToolSelected(toolId) {
        for (
            const callback
            of this.toolSelectedListeners
        ) {
            callback(toolId);
        }
    }

    setActiveTool(toolId) {
        for (
            const [id, button]
            of this.buttons.entries()
        ) {
            const isActive = id === toolId;

            button.classList.toggle(
                "map-toolbar__button--active",
                isActive
            );

            button.setAttribute(
                "aria-pressed",
                String(isActive)
            );
        }
    }
}