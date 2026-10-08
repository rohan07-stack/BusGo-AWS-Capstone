const API_BASE_URL = "https://hnsrkhfnqe.execute-api.ap-south-1.amazonaws.com";

const fromSelect = document.getElementById("from");
const toSelect = document.getElementById("to");
const dateInput = document.getElementById("travelDate");
const searchFeedback = document.getElementById("searchFeedback");
const searchForm = document.getElementById("searchForm");
const searchButton = searchForm.querySelector('button[type="submit"]');

const today = new Date();
const localToday = new Date(today.getTime() - today.getTimezoneOffset() * 60000)
  .toISOString().slice(0, 10);
dateInput.min = localToday;
dateInput.value = localToday;
document.getElementById("year").textContent = new Date().getFullYear();

function setFeedback(message, kind = "info") {
  searchFeedback.textContent = message;
  searchFeedback.className = `search-feedback feedback-${kind}`;
}

async function readApiResponse(response) {
  const raw = await response.text();
  let result = {};
  if (raw) {
    try {
      result = JSON.parse(raw);
    } catch {
      result = { message: raw };
    }
  }

  // Some integrations wrap the Lambda payload inside a body string.
  if (typeof result.body === "string") {
    try {
      result = { ...result, ...JSON.parse(result.body) };
    } catch {
      // Keep the original response if body is not JSON.
    }
  } else if (result.body && typeof result.body === "object") {
    result = { ...result, ...result.body };
  }
  return result;
}

function getBookingId(result) {
  const candidates = [
    result?.booking?.bookingId,
    result?.bookingId,
    result?.booking?.id,
    result?.id,
    result?.body?.booking?.bookingId,
    result?.body?.bookingId
  ];
  return candidates.find((value) => typeof value === "string" && value.trim()) || "";
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

document.getElementById("swapLocations").addEventListener("click", () => {
  const previousFrom = fromSelect.value;
  fromSelect.value = toSelect.value;
  toSelect.value = previousFrom;
});

searchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const from = fromSelect.value;
  const to = toSelect.value;
  const date = dateInput.value;

  if (!from || !to || !date) {
    setFeedback("Please choose a departure city, destination, and travel date.", "error");
    return;
  }
  if (from === to) {
    setFeedback("Please choose two different cities.", "error");
    return;
  }
  if (date < localToday) {
    setFeedback("Please choose today or a future travel date.", "error");
    return;
  }

  searchButton.disabled = true;
  searchButton.textContent = "Searching…";
  setFeedback("Finding buses for your journey…", "loading");

  try {
    const url = new URL(`${API_BASE_URL.replace(/\/$/, "")}/buses`);
    url.searchParams.set("from", from);
    url.searchParams.set("to", to);
    const apiResponse = await fetch(url);
    const result = await readApiResponse(apiResponse);
    if (!apiResponse.ok) {
      throw new Error(result.message || `Bus search failed (HTTP ${apiResponse.status}).`);
    }

    const buses = Array.isArray(result.buses) ? result.buses : [];
    searchFeedback.replaceChildren();
    searchFeedback.className = "search-feedback";

    if (!buses.length) {
      setFeedback(`No buses found for ${from} → ${to}. Try another route.`, "info");
      return;
    }

    const resultsHeader = createElement("div", "results-header");
    resultsHeader.append(
      createElement("h3", "results-title", `${buses.length} ${buses.length === 1 ? "bus" : "buses"} found`),
      createElement("p", "results-route", `${from} → ${to} · ${date}`)
    );
    searchFeedback.appendChild(resultsHeader);

    const passengerGroup = createElement("div", "passenger-field");
    const passengerLabel = createElement("label", "", "Passenger name");
    passengerLabel.htmlFor = "passengerName";
    const passengerInput = createElement("input");
    passengerInput.id = "passengerName";
    passengerInput.name = "passengerName";
    passengerInput.type = "text";
    passengerInput.maxLength = 100;
    passengerInput.placeholder = "Enter passenger's full name";
    passengerInput.autocomplete = "name";
    passengerInput.required = true;
    passengerGroup.append(passengerLabel, passengerInput);
    searchFeedback.appendChild(passengerGroup);

    const resultsGrid = createElement("div", "bus-results-grid");
    buses.forEach((bus) => {
      const card = createElement("article", "bus-result");
      const cardTop = createElement("div", "bus-result-top");
      cardTop.append(
        createElement("span", "bus-type-pill", bus.type || "Bus service"),
        createElement("span", "bus-fare", `₹${Number(bus.fare || 0).toLocaleString("en-IN")}`)
      );
      const operator = createElement("h4", "bus-operator", bus.operator || "Bus operator");
      const times = createElement("div", "bus-times");
      const departure = createElement("div", "bus-time");
      departure.append(createElement("strong", "", bus.departure || "—"), createElement("span", "", from));
      const routeLine = createElement("div", "bus-route-line", "→");
      const arrival = createElement("div", "bus-time bus-time-arrival");
      arrival.append(createElement("strong", "", bus.arrival || "—"), createElement("span", "", to));
      times.append(departure, routeLine, arrival);
      const details = createElement("p", "bus-seat-note", `${bus.seatsAvailable ?? "—"} listed seats · ${bus.type || "Standard"}`);
      const bookButton = createElement("button", "book-now", "Book this bus");
      bookButton.type = "button";
      card.append(cardTop, operator, times, details, bookButton);
      resultsGrid.appendChild(card);

      bookButton.addEventListener("click", async () => {
        const passengerName = passengerInput.value.trim();
        if (!passengerName) {
          passengerInput.setCustomValidity("Please enter the passenger name.");
          passengerInput.reportValidity();
          passengerInput.focus();
          return;
        }
        passengerInput.setCustomValidity("");
        if (passengerName.length > 100) {
          setFeedback("Passenger name must be 100 characters or fewer.", "error");
          return;
        }

        bookButton.disabled = true;
        bookButton.textContent = "Confirming…";
        try {
          const bookingResponse = await fetch(`${API_BASE_URL.replace(/\/$/, "")}/bookings`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ busId: bus.busId, passengerName, travelDate: date })
          });
          const bookingResult = await readApiResponse(bookingResponse);
          console.info("BusGo booking API response:", bookingResult);

          if (!bookingResponse.ok) {
            throw new Error(bookingResult.message || `Booking failed (HTTP ${bookingResponse.status}).`);
          }

          const bookingId = getBookingId(bookingResult);
          if (!bookingId) {
            console.error("Successful booking response did not include a recognized booking ID.", bookingResult);
            card.replaceChildren(
              createElement("h4", "confirmation-title", "Booking request received"),
              createElement("p", "confirmation-copy", "The API returned success, but no booking reference was found in its response."),
              createElement("p", "confirmation-warning", "Check DynamoDB before trying again to avoid creating a duplicate booking.")
            );
            return;
          }

          const confirmation = createElement("div", "booking-confirmation");
          confirmation.append(
            createElement("span", "confirmation-check", "✓"),
            createElement("h4", "confirmation-title", "You're booked!"),
            createElement("p", "confirmation-copy", `${passengerName} · ${from} → ${to}`),
            createElement("p", "confirmation-copy", `Travel date: ${date}`),
            createElement("p", "booking-reference-label", "YOUR BOOKING REFERENCE"),
            createElement("code", "booking-reference", bookingId)
          );
          const copyButton = createElement("button", "copy-booking-id", "Copy booking ID");
          copyButton.type = "button";
          copyButton.addEventListener("click", async () => {
            try {
              await navigator.clipboard.writeText(bookingId);
              copyButton.textContent = "Copied!";
            } catch {
              copyButton.textContent = "Select the ID above to copy";
            }
          });
          confirmation.appendChild(copyButton);
          card.replaceChildren(confirmation);
          passengerInput.disabled = true;
        } catch (error) {
          console.error("BusGo booking error:", error);
          card.replaceChildren(
            createElement("h4", "confirmation-title", "We couldn't confirm the booking"),
            createElement("p", "confirmation-copy", error.message || "Please check your connection."),
            createElement("p", "confirmation-warning", "If the request may have reached AWS, check DynamoDB before trying again.")
          );
        }
      });
    });
    searchFeedback.appendChild(resultsGrid);
    searchFeedback.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (error) {
    console.error("BusGo bus search error:", error);
    setFeedback(`${error.message || "Could not load buses."} Check the API URL, API deployment, and CORS settings.`, "error");
  } finally {
    searchButton.disabled = false;
    searchButton.innerHTML = 'Search buses <span>→</span>';
  }
});

document.querySelectorAll(".route-select").forEach((button) => {
  button.addEventListener("click", () => {
    fromSelect.value = button.dataset.from;
    toSelect.value = button.dataset.to;
    document.getElementById("search").scrollIntoView({ behavior: "smooth" });
    setFeedback(`Route selected: ${button.dataset.from} → ${button.dataset.to}. Choose a date and search.`, "info");
  });
});

const menuToggle = document.querySelector(".menu-toggle");
const nav = document.querySelector(".main-nav");
menuToggle.addEventListener("click", () => {
  const isOpen = nav.classList.toggle("open");
  menuToggle.setAttribute("aria-expanded", String(isOpen));
});
nav.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    nav.classList.remove("open");
    menuToggle.setAttribute("aria-expanded", "false");
  });
});

// Subtle entrance effects; content remains visible when reduced motion is preferred.
if ("IntersectionObserver" in window && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  const revealItems = document.querySelectorAll(".destination-card, .step, .cloud-banner, .search-intro");
  revealItems.forEach((item) => item.classList.add("reveal-ready"));
  const observer = new IntersectionObserver((entries, currentObserver) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("revealed");
        currentObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  revealItems.forEach((item) => observer.observe(item));
}
