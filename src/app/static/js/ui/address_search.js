export class AddressSearch {
    constructor({
        geocodingClient,
        mountPoint = document.body,
        minChars = 3,
        debounceMs = 1000,
    }) {
        this.geocodingClient = geocodingClient;
        this.minChars = minChars;
        this.debounceMs = debounceMs;

        this.locationSelectedListeners = new Set();
        this.pinRequestedListeners = new Set();
        this.debounceTimer = null;
        this.selectedResult = null;

        this.element = this.createElement();
        mountPoint.appendChild(this.element);

        document.addEventListener("click", (event) => {
            if (!this.element.contains(event.target)) {
                this.hideResults();
            }
        });
    }

    createElement() {
        const container = document.createElement("div");
        container.className = "address-search";

        this.input = document.createElement("input");
        this.input.type = "search";
        this.input.id = "address-search-input";
        this.input.name = "address";
        this.input.className = "address-search__input";
        this.input.placeholder = "Search address…";
        this.input.setAttribute("aria-label", "Search address");
        this.input.setAttribute("aria-autocomplete", "list");
        this.input.setAttribute("autocomplete", "off");

        this.resultsList = document.createElement("ul");
        this.resultsList.className = "address-search__results";
        this.resultsList.setAttribute("role", "listbox");
        this.resultsList.hidden = true;

        this.pinButton = document.createElement("button");
        this.pinButton.type = "button";
        this.pinButton.className = "address-search__pin-button";
        this.pinButton.textContent = "📍 Save as pin";
        this.pinButton.hidden = true;

        this.pinButton.addEventListener("click", () => {
            if (this.selectedResult !== null) {
                this.emitPinRequested(this.selectedResult);
            }
        });

        this.input.addEventListener("input", () => {
            this.handleInput();
        });

        container.append(this.input, this.resultsList, this.pinButton);

        return container;
    }

    handleInput() {
        const query = this.input.value.trim();

        clearTimeout(this.debounceTimer);

        this.selectedResult = null;
        this.pinButton.hidden = true;

        if (query.length < this.minChars) {
            this.hideResults();
            return;
        }

        this.debounceTimer = setTimeout(() => {
            void this.performSearch(query);
        }, this.debounceMs);
    }

    async performSearch(query) {
        this.showMessage("Searching…");

        try {
            const results = await this.geocodingClient.search(query);
            this.showResults(results);
        } catch {
            this.showMessage("Search failed. Please try again.");
        }
    }

    showResults(results) {
        this.resultsList.innerHTML = "";

        if (results.length === 0) {
            this.showMessage("No results found.");
            return;
        }

        for (const result of results) {
            const item = document.createElement("li");

            item.className = "address-search__result";
            item.setAttribute("role", "option");
            item.textContent = result.label;

            item.addEventListener("click", () => {
                this.input.value = result.label;
                this.selectedResult = result;
                this.pinButton.hidden = false;
                this.hideResults();
                this.emitLocationSelected(result);
            });

            this.resultsList.appendChild(item);
        }

        this.resultsList.hidden = false;
    }

    showMessage(text) {
        this.resultsList.innerHTML = "";

        const item = document.createElement("li");
        item.className = "address-search__message";
        item.textContent = text;

        this.resultsList.appendChild(item);
        this.resultsList.hidden = false;
    }

    hideResults() {
        this.resultsList.hidden = true;
        this.resultsList.innerHTML = "";
    }

    onLocationSelected(callback) {
        this.locationSelectedListeners.add(callback);

        return () => {
            this.locationSelectedListeners.delete(callback);
        };
    }

    onPinRequested(callback) {
        this.pinRequestedListeners.add(callback);

        return () => {
            this.pinRequestedListeners.delete(callback);
        };
    }

    emitLocationSelected(result) {
        for (const callback of this.locationSelectedListeners) {
            callback(result);
        }
    }

    emitPinRequested(result) {
        for (const callback of this.pinRequestedListeners) {
            callback(result);
        }
    }
}
