function cleanText(text) {
    return text.replace(/\s+/g, " ").trim();
}

function getDefaultDay() {
    const today = new Date().getDay();

    const dayNames = [
        "Nedeľa",
        "Pondelok",
        "Utorok",
        "Streda",
        "Štvrtok",
        "Piatok",
        "Sobota"
    ];

    if (today === 0 || today === 6) {
        return "Pondelok";
    }

    return dayNames[today];
}

let selectedDay = getDefaultDay();
const menuData = {};


// LOCAL STORAGE

const MENU_STORAGE_PREFIX = "obedove-menu-";

function saveMenu(restaurantId, days) {
    const data = {
        savedAt: new Date().toISOString(),
        days
    };

    try {
        localStorage.setItem(
            MENU_STORAGE_PREFIX + restaurantId,
            JSON.stringify(data)
        );
    } catch {
    }

    return new Date(data.savedAt);
}


function loadSavedMenu(restaurantId) {
    const key = MENU_STORAGE_PREFIX + restaurantId;

    try {
        const savedText = localStorage.getItem(key);

        if (!savedText) {
            return null;
        }

        const data = JSON.parse(savedText);

        if (!data || !data.savedAt || !Array.isArray(data.days)) {
            localStorage.removeItem(key);
            return null;
        }

        const savedAt = new Date(data.savedAt);

        if (
            Number.isNaN(savedAt.getTime()) ||
            savedAt.toDateString() !== new Date().toDateString()
        ) {
            localStorage.removeItem(key);
            return null;
        }

        return {
            savedAt,
            days: data.days
        };
    } catch {
        return null;
    }
}


// SPRACOVANIE EAT & MEET

function parseEatAndMeet(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const days = [];

    const $dayLinks = $(doc).find(".tabs-link a");

    $dayLinks.each((index, link) => {
        const $link = $(link);
        const dayId = ($link.attr("href") || "").split("#").pop();
        const dayName = cleanText($link.text());
        const panel = doc.getElementById(dayId);

        if (!panel) {
            return;
        }

        const meals = [];

        $(panel).find(".menu-body").each((index, item) => {
            const $item = $(item);

            const category = cleanText(
                $item.find(".menu-title h4").first().text()
            );

            const isSoup = /^polievka\b/i.test(category);
            const isMain = /^menu\b/i.test(category);

            if (!isSoup && !isMain) {
                return;
            }

            const $description = $item
                .find(".menu-description .desc")
                .first()
                .clone();

            const allergens = $description
                .find("span")
                .map((i, span) => cleanText($(span).text()))
                .get()
                .join(", ");

            $description.find("span").remove();

            const name = cleanText($description.text());
            const $price = $item.find(".menu-title .price").first();

            const price = cleanText(
                $price.contents()
                    .filter(function () {
                        return this.nodeType === 3;
                    })
                    .first()
                    .text()
                    .replace("/", "")
            );

            const priceWithSubsidy = cleanText(
                $price.children("span").first().text()
            );

            if (name) {
                meals.push({
                    category,
                    type: isSoup ? "soup" : "main",
                    name,
                    allergens,
                    price,
                    priceWithSubsidy
                });
            }
        });

        if (meals.length > 0) {
            days.push({
                name: dayName,
                meals
            });
        }
    });

    if (days.length === 0) {
        throw new Error("Nepodarilo sa nájsť menu Eat & Meet.");
    }

    return days;
}


// SPRACOVANIE DRAG

function parseDrag(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const days = [];

    const $dayLinks = $(doc).find(".menu_box_nav a");

    $dayLinks.each((index, link) => {
        const $link = $(link);
        const dayId = ($link.attr("href") || "").split("#").pop();
        const dayName = cleanText($link.text());
        const panel = doc.getElementById(dayId);

        if (!panel) {
            return;
        }

        const meals = [];

        const $soupHeading = $(panel)
            .find(".menu_box_title h3")
            .filter(function () {
                return cleanText($(this).text()).toUpperCase()
                    === "POLIEVKA";
            })
            .first();

        const $mainHeading = $(panel)
            .find(".menu_box_title h3")
            .filter(function () {
                return cleanText($(this).text()).toUpperCase()
                    === "HLAVNÉ JEDLO";
            })
            .first();


        // Polievka 
        if ($soupHeading.length && $mainHeading.length) {
            let soupText = "";
            let node = $soupHeading.parent()[0].nextSibling;

            while (node) {
                const isMainHeading =
                    node.nodeType === 1
                    && $(node).hasClass("menu_box_title")
                    && cleanText($(node).text()).toUpperCase()
                        === "HLAVNÉ JEDLO";

                if (isMainHeading) {
                    break;
                }

                if (node.nodeType === 1 || node.nodeType === 3) {
                    soupText += " " + node.textContent;
                }

                node = node.nextSibling;
            }

            const allergenMatch = soupText.match(
                /\/\s*([\d,\s]+)\s*\//
            );

            const allergens = allergenMatch
                ? "(" + allergenMatch[1].replace(/\s/g, "") + ")"
                : "";

            const name = cleanText(
                soupText
                    .replace(/\/\s*[\d,\s]+\s*\//, "")
                    .replace(/^0,3l\.?\s*/i, "")
            );

            if (name) {
                meals.push({
                    category: "Polievka 1",
                    type: "soup",
                    name,
                    allergens,
                    price: "",
                    priceWithSubsidy: ""
                });
            }
        }


        // HLAVNÉ JEDLO

        if ($mainHeading.length) {
            const $table = $mainHeading
                .closest(".menu_box_title")
                .nextAll("table")
                .first();

            let mainNumber = 0;

            $table.find("tr").each((index, row) => {
                const $cells = $(row).children("td");

                let name = cleanText($cells.eq(0).text());
                const price = cleanText($cells.eq(1).text());

                if (!name) {
                    return;
                }

                const allergenMatch = name.match(
                    /\/\s*([\d,\s]+)\s*\//
                );

                const allergens = allergenMatch
                    ? "(" + allergenMatch[1].replace(/\s/g, "") + ")"
                    : "";

                name = cleanText(
                    name
                        .replace(/\/\s*[\d,\s]+\s*\//, "")
                        .replace(/^\d+\s*g(?:\s*\/\s*\d+\s*g)?\s*/i, "")
                );

                if (name) {
                    mainNumber++;

                    meals.push({
                        category: `MENU ${mainNumber}`,
                        type: "main",
                        name,
                        allergens,
                        price,
                        priceWithSubsidy: ""
                    });
                }
            });
        }

        if (meals.length > 0) {
            days.push({
                name: dayName,
                meals
            });
        }
    });

    if (days.length === 0) {
        throw new Error("Nepodarilo sa nájsť menu DRAG.");
    }

    return days;
}


// SPRACOVANIE Fiit-Food

function parseFiitFood(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const days = [];

    const $dayItems = $(doc).find("#fiit-food ul.daily-offer > li");

    $dayItems.each((dayIndex, dayItem) => {
        const $dayItem = $(dayItem);

        const fullDayName = cleanText(
            $dayItem.children(".day-title").first().text()
        );

        const dayText = fullDayName.split(",")[0].toLowerCase();
        const dayName = dayText.charAt(0).toUpperCase() + dayText.slice(1);

        const meals = [];

        let soupNumber = 0;
        let mainNumber = 0;

        $dayItem.children("ul.day-offer").children("li").each((index, item) => {
            const $item = $(item);

            const marker = cleanText(
                $item.children("span.brand:not(.price)").first().text()
            );

            const isSoup = /^P\./i.test(marker);
            const isMain = /^\d+\./.test(marker);

            if (!isSoup && !isMain) {
                return;
            }

            const price = cleanText(
                $item.children("span.price").last().text()
            );

            const $copy = $item.clone();
            $copy.find("span.brand").remove();

            let name = cleanText($copy.text());

            if (!name) {
                return;
            }

            if (/^zatvorené$/i.test(name)) {
                meals.push({
                    category: "",
                    type: "closed",
                    name: "Zatvorené",
                    allergens: "",
                    price: "",
                    priceWithSubsidy: ""
                });
                return;
            }

            const allergenMatch = name.match(/\bA:\s*([\d,\s]*)/i);

            const allergens = allergenMatch && cleanText(allergenMatch[1])
                ? `(${cleanText(allergenMatch[1]).replace(/\s/g, "")})`
                : "";

            name = cleanText(name.replace(/\bA:\s*[\d,\s]*/i, ""));

            if (!name) {
                return;
            }

            const formattedPrice = price
                .replace(/\./g, ",")
                .replace(/\s*€$/, " €");


            let category;

            if (isSoup) {
                soupNumber++;
                category = `Polievka ${soupNumber}`;
            } else {
                mainNumber++;
                category = `MENU ${mainNumber}`;
            }

            meals.push({
                category,
                type: isSoup ? "soup" : "main",
                name,
                allergens,
                price: formattedPrice,
                priceWithSubsidy: ""
            });
        });

        if (meals.length > 0) {
            days.push({
                name: dayName,
                meals
            });
        }
    });

    if (days.length === 0) {
        throw new Error("Nepodarilo sa nájsť menu FIIT Food.");
    }

    return days;
}


// ZOZNAM REŠTAURÁCIÍ

const restaurants = [
    {
        id: "eat-and-meet",
        name: "Eat & Meet",
        localUrl: "source/eat-and-meet.html",
        container: "#eat-and-meet-menu",
        website: "https://eatandmeet.sk/tyzdenne-menu",
        parse: parseEatAndMeet
    },
    {
        id: "drag",
        name: "DRAG",
        localUrl: "source/drag.html",
        container: "#drag-menu",
        website: "https://www.restauracia-drag.sk/denne-menu",
        parse: parseDrag
    },
    {
        id: "fiit-food",
        name: "FIIT Food",
        localUrl: "source/fiit-food.html",
        container: "#fiit-food-menu",
        website: "http://www.freefood.sk/menu/#fiit-food",
        parse: parseFiitFood
    }
];


// ZOBRAZENIE JEDÁL

function renderMenu(restaurant, days) {
    const $container = $(restaurant.container).empty();

    const visibleDays = selectedDay === "all"
        ? days.filter(day =>
            !["sobota", "nedeľa"].includes(day.name.toLowerCase())
        )
        : days.filter(day =>
            day.name.toLowerCase() === selectedDay.toLowerCase()
        );

    if (visibleDays.length === 0) {
        $container.append(
            $("<p>").text("Pre vybraný deň sa menu nenašlo.")
        );
        return;
    }

    visibleDays.forEach(day => {
        const $day = $("<section>").addClass("eat-meet-day");

        $day.append(
            $("<h3>")
                .addClass("menu-day-title")
                .text(day.name)
        );

        const groups = [
            { type: "soup", title: "Polievky" },
            { type: "main", title: "Hlavné jedlá" }
        ];

        groups.forEach(group => {
            const meals = day.meals.filter(
                meal => meal.type === group.type
            );

            if (meals.length === 0) {
                return;
            }

            $day.append(
                $("<h4>")
                    .addClass("menu-group-title")
                    .text(group.title)
            );

            const $row = $("<div>").addClass("row");

            meals.forEach(meal => {
                const $card = $("<article>")
                    .addClass("card h-100 menu-card");

                const $body = $("<div>").addClass("card-body");

                if (meal.category) {
                    $body.append(
                        $("<h5>")
                            .addClass("menu-item-category")
                            .text(meal.category)
                    );
                }

                $body.append(
                    $("<p>")
                        .addClass("menu-item-name")
                        .text(meal.name)
                );

                $body.append(
                    $("<p>")
                        .addClass("menu-allergens")
                        .text(`Alergény: ${meal.allergens || "–"}`)
                );

                let priceText = "Cena: –";

                if (meal.price && meal.priceWithSubsidy) {
                    if (meal.price === meal.priceWithSubsidy) {
                        priceText = `Cena: ${meal.price}`;
                    } else {
                        priceText =
                            `Cena: ${meal.price} / s dotáciou: ${meal.priceWithSubsidy}`;
                    }
                } else if (meal.price || meal.priceWithSubsidy) {
                    priceText = `Cena: ${meal.price || meal.priceWithSubsidy}`;
                }

                $body.append(
                    $("<p>")
                        .addClass("menu-price")
                        .text(priceText)
                );

                $card.append($body);

                $row.append(
                    $("<div>")
                        .addClass("col-12 col-md-6 mb-3")
                        .append($card)
                );
            });

            $day.append($row);
        });

        $container.append($day);
    });
}


// PREKRESLENIE VŠETKÝCH REŠTAURÁCIÍ
function renderAllMenus() {
    restaurants.forEach(restaurant => {
        if (menuData[restaurant.id]) {
            renderMenu(restaurant, menuData[restaurant.id]);
        }
    });
}


// VÝBER DŇA
function setupDayButtons() {
    const buttons = document.querySelectorAll(
        "#day-picker button"
    );

    buttons.forEach(button => {
        button.addEventListener("click", () => {

            buttons.forEach(item => {
                item.classList.remove("active");
            });

            button.classList.add("active");

            const day = cleanText(button.textContent);

            if (day.toLowerCase() === "celý týždeň") {
                selectedDay = "all";
            } else {
                selectedDay = day;
            }

            renderAllMenus();
        });
    });

    const todayButton = Array.from(buttons).find(button =>
        cleanText(button.textContent).toLowerCase()
            === selectedDay.toLowerCase()
    );

    if (todayButton) {
        todayButton.classList.add("active");
    }
}



// Filter Restauracii
function setupRestaurantFilters() {
    const checkboxes = document.querySelectorAll(
        'input[name="restaurant"]'
    );

    const message = document.getElementById("no-restaurants-selected");
    const heading = document.getElementById("restaurant-menu-heading");

    function updateMessage() {
        const anySelected = Array.from(checkboxes)
            .some(checkbox => checkbox.checked);
        message.hidden = anySelected;
        heading.hidden = !anySelected;
    }

    checkboxes.forEach(checkbox => {
        const menu = document.getElementById(
            checkbox.value + "-menu"
        );

        if (!menu) {
            return;
        }

        const card = menu.closest(".restaurant-card");

        if (!card) {
            return;
        }

        card.hidden = !checkbox.checked;

        checkbox.addEventListener("change", function () {
            card.hidden = !this.checked;
            updateMessage();
        });
    });

    updateMessage();
}


// ZOBRAZENIE CASU POSLEDNEJ AKTUALIZACIE
function showUpdateTime(restaurant, date) {
    const updateElement = document.getElementById(
        `${restaurant.id}-updated`
    );

    if (!updateElement) {
        return;
    }

    if (date) {
        updateElement.textContent = date.toLocaleString("sk-SK");
    } else {
        updateElement.textContent = "zatiaľ žiadna";
    }
}


// NACITANIE RESTAURACIE
async function loadRestaurant(restaurant, forceRefresh = false) {
    const $container = $(restaurant.container);

    if ($container.length === 0) {
        return;
    }

    if (!forceRefresh) {
        const saved = loadSavedMenu(restaurant.id);

        if (saved) {
            menuData[restaurant.id] = saved.days;

            renderMenu(restaurant, saved.days);
            showUpdateTime(restaurant, saved.savedAt);

            return;
        }
    }

    $container.text(`Načítavam menu ${restaurant.name}...`);

    try {
        const response = await fetch(restaurant.localUrl);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const html = await response.text();
        const days = restaurant.parse(html);

        menuData[restaurant.id] = days;

        const savedAt = saveMenu(restaurant.id, days);

        renderMenu(restaurant, days);
        showUpdateTime(restaurant, savedAt);

    } catch {
        $container.text(
            `Menu ${restaurant.name} sa nepodarilo načítať.`
        );
    }
}


// AKTUALIZOVANIE VSETKYCH MENU
async function refreshAllMenus() {
    const button = document.getElementById("update-menu");
    const message = document.getElementById("menu-storage-message");

    button.disabled = true;
    message.textContent = "Aktualizujem menu...";

    try {
        await Promise.all(
            restaurants.map(restaurant =>
                loadRestaurant(restaurant, true)
            )
        );

       message.textContent = "";

    } catch {
        message.textContent =
            "Pri aktualizácii sa vyskytla chyba.";

    } finally {
        button.disabled = false;
    }
}


// VYMAZANIE ULOŽENÝCH DÁT
function clearSavedMenus() {
    restaurants.forEach(restaurant => {
        localStorage.removeItem(
            MENU_STORAGE_PREFIX + restaurant.id
        );
    });
}




setupDayButtons();
setupRestaurantFilters();

document.getElementById("update-menu")
    .addEventListener("click", refreshAllMenus);

document.getElementById("clear-menu-storage")
    .addEventListener("click", clearSavedMenus);

restaurants.forEach(restaurant => {
    loadRestaurant(restaurant);
});