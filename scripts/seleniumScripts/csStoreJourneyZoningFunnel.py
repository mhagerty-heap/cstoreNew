import sys
import time
import json
import math
import random
import datetime
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.wait import WebDriverWait
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import Select

# ---------------------------------------------------------------------------
# [INIT] Script metadata
# ---------------------------------------------------------------------------
scriptRunTimestamp = datetime.datetime.now()
print("[INIT] " + "=" * 60)
print("[INIT] scriptRunTimestamp = " + str(scriptRunTimestamp))
print("[INIT] scriptname = csStoreJourneyZoningFunnel.py")

# ---------------------------------------------------------------------------
# [INIT] Load customer persona
#
# Returning-user pool: first 200 entries in the JSON match accounts seeded
# into the DB via `npm run seed-users`. These are picked without a +alias
# suffix so login_account() works against the real DB record.
#
# 30% of sessions are returning visitors (login), 70% are new (register).
# ---------------------------------------------------------------------------
PERSONA_FILE = '/Users/mikehagerty/cstoreCopyProject/ecommerce-main/scripts/seleniumScripts/csStoreCustomerPersonas.json'
RETURNING_POOL_SIZE = 200
RETURNING_USER_RATE = 0.30

with open(PERSONA_FILE, 'r') as f:
    customerData = json.load(f)

print("[INIT] Loading user profiles from: " + PERSONA_FILE)
print("[INIT] userData loaded — " + str(len(customerData)) + " profiles available")

isReturningUser = random.random() < RETURNING_USER_RATE

if isReturningUser:
    # Pick from the seeded pool — use the exact email, no +alias
    randomPersonaSelector = random.randint(0, RETURNING_POOL_SIZE - 1)
else:
    # Pick from the full list for variety among new registrations
    randomPersonaSelector = random.randint(0, len(customerData) - 1)

print("[INIT] isReturningUser  = " + str(isReturningUser))
print("[INIT] selected profile index = " + str(randomPersonaSelector))

customerName             = customerData[randomPersonaSelector]["customerName"]
customerNameArray        = customerName.split()
customerFirstName        = customerNameArray[0]
customerLastName         = customerNameArray[1]
customerEmailOriginal    = customerData[randomPersonaSelector]["customerEmail"]
customerPassword         = customerData[randomPersonaSelector]["customerPassword"]
customerStreetAddress    = customerData[randomPersonaSelector]["customerStreetAddress"]
customerPostalCode       = str(customerData[randomPersonaSelector]["customerPostalCode"])
customerState            = str(customerData[randomPersonaSelector]["customerState"])
customerCity             = str(customerData[randomPersonaSelector]["customerCity"])
customerCountry          = str(customerData[randomPersonaSelector]["customerCountry"])
customerMobileNumber     = customerData[randomPersonaSelector]["customerMobileNumber"]
customerNumberOfPastPurchases = customerData[randomPersonaSelector]["customerNumberOfPastPurchases"]
customerLastPurchaseDate = customerData[randomPersonaSelector]["customerLastPurchaseDate"]
customerTotalSpent       = customerData[randomPersonaSelector]["customerTotalSpent"]

if isReturningUser:
    # Use the exact email — must match the seeded DB record
    customerEmail = customerEmailOriginal.lower().strip()
else:
    # Unique email per run so registration always succeeds
    appendId = random.randint(1000000000000000, 9999999999999999)
    emailUser   = customerEmailOriginal.split("@")[0]
    emailDomain = customerEmailOriginal.split("@")[1]
    customerEmail = emailUser + "+" + str(appendId) + "@" + emailDomain

print("[INIT] firstName        = " + customerFirstName)
print("[INIT] lastName         = " + customerLastName)
print("[INIT] email            = " + customerEmail)
print("[INIT] city             = " + customerCity)
print("[INIT] state            = " + customerState)

# ---------------------------------------------------------------------------
# [INIT] Path selection — weighted to ~8% true conversion
#
#   Path 1 – Happy Purchase                    weight  8  (~8%)
#   Path 2 – Wishlist & Bounce                 weight 25  (~25%)
#   Path 3 – Search & Browse Only              weight 28  (~28%)
#   Path 4 – Cart Abandonment                  weight 19  (~19%)
#   Path 5 – Frustrated Researcher             weight 15  (~15%)
#   Path 6 – Homepage Rage Bounce (Broken UTM) weight  5  (~5%) — also auto-selected when utmIndex==6
# ---------------------------------------------------------------------------
PATH_WEIGHTS    = [8, 22, 26, 17, 14, 5, 8]
PATH_NAMES      = [
    "Happy Purchase",
    "Wishlist & Bounce",
    "Search & Browse Only",
    "Cart Abandonment",
    "Frustrated Researcher",
    "Homepage Rage Bounce (Broken Campaign)",
    "Checkout Card Abandonment",
]
population  = list(range(1, 8))
selectedPath = random.choices(population, weights=PATH_WEIGHTS, k=1)[0]
selectedPathName = PATH_NAMES[selectedPath - 1]

# ---------------------------------------------------------------------------
# [INIT] Randomised session variables
# ---------------------------------------------------------------------------
siteDomain = "cstore-new.vercel.app"

# UTM variants and their matching referrer URLs are paired by index.
# Index 6 is the BrokenCampaign — always forces Path 6 (homepage rage bounce).
# "" referrer = direct/typed visit (no Referer header injected).
utmVariants = [
    "/promo/summer-sale?utm_source=EmailList1&utm_medium=email&utm_campaign=SwitchNow&utm_content=UnlimitedOffer",
    "/promo/new-arrivals?utm_source=Google&utm_medium=cpc&utm_campaign=SponsoredContent&utm_content=StylesThatNeverQuit",
    "/promo/running-gear?utm_source=Facebook&utm_medium=display&utm_campaign=GlobalCampaign&utm_content=NewLineup",
    "/promo/running-gear?utm_source=Twitter&utm_medium=display&utm_campaign=GlobalCampaign&utm_content=NewLineup",
    "/?utm_source=Blog&utm_medium=referral&utm_campaign=NewArticles&utm_content=LatestTech",
    "/?utm_source=Affiliate&utm_medium=referral&utm_campaign=RetailForAll&utm_content=ContentSeries1",
    "/?utm_source=Instagram&utm_medium=display&utm_campaign=BrokenCampaign&utm_content=SneakerDrop",
]
utmReferrers = [
    "https://mail.google.com/",
    "https://www.google.com/",
    "https://www.facebook.com/",
    "https://x.com/",
    "https://blog.example.com/",
    "https://www.affiliatesite.com/",
    "https://www.instagram.com/",   # BrokenCampaign source
]

# BrokenCampaign (index 6) always forces Path 6 regardless of random selection
timeSinceEpoch = str(time.time())
utmIndex   = int(timeSinceEpoch[-1]) % len(utmVariants)
referrerUrl = utmReferrers[utmIndex]

if utmIndex == 6:
    selectedPath     = 6
    selectedPathName = "Homepage Rage Bounce (Broken Campaign)"
    print("[INIT] BrokenCampaign UTM detected — forcing path 6 (Homepage Rage Bounce)")

utmSuffix   = utmVariants[utmIndex] + "&sessionReplay=true&sessionReplayName=csStoreJourneyZoningFunnel"
startingUrl = "https://" + siteDomain + utmSuffix

searchTerms = ["nike", "adidas", "vans", "converse", "puma", "running", "basketball", "air max", "chuck", "old skool"]
selectedSearchValue = random.choice(searchTerms)

# For Google referrers, append the on-site search term as the Google query string.
# This creates a coherent acquisition story in CSQ: user searched "nike" on Google
# → landed on the site → searched "nike" in site search → browsed results.
if referrerUrl and "google.com" in referrerUrl:
    googleSearchQuery = selectedSearchValue.replace(" ", "+")
    referrerUrl = "https://www.google.com/search?q=" + googleSearchQuery + "+shoes"

# Category slugs used for /shop?category= navigation
categorySlugTerms = ["baseball", "basketball", "classics", "golf", "lifestyle", "running", "soccer", "tennis", "training", "walking", "yoga"]

# Nav categories available for hover/click simulation
topLevelCats   = ["sports", "running", "lifestyle", "classics"]
allSubCats     = ["basketball", "golf", "tennis", "soccer", "trail-running", "training",
                  "walking", "yoga", "classics", "lifestyle", "baseball", "track-and-field"]
heroSlide      = random.randint(1, 3)

print("[INIT] port_in          = True")
print("[INIT] user_agent       = Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6_7) AppleWebKit/605.1.15 (KHT...")
print("[INIT] utmIndex         = " + str(utmIndex))
print("[INIT] startingUrl      = " + startingUrl)
if referrerUrl:
    print("[INIT] referrerUrl      = " + referrerUrl)
print("[INIT] selectedPath     = " + str(selectedPath) + " (" + selectedPathName + ")")
print("[INIT] " + "=" * 60)

# ---------------------------------------------------------------------------
# [BROWSER] Chrome setup
# ---------------------------------------------------------------------------
print("[BROWSER] Initialising Chrome...")
userAgentString = "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6_7) AppleWebKit/605.1.15 (KHT...)"

options = webdriver.ChromeOptions()
options.add_argument("--headless=new")       # headless mode (Chrome 112+)
options.add_argument("--no-sandbox")
options.add_argument("--disable-dev-shm-usage")
options.add_argument("--disable-gpu")
options.add_argument("--window-size=1920,1080")
options.add_argument("user-agent=" + userAgentString)
options.page_load_strategy = "normal"

driver = webdriver.Chrome(options=options)
driver.set_window_position(0, 0)
driver.set_window_size(1920, 1080)
windowSize = driver.get_window_size()
print("[BROWSER] Chrome launched — window size = " + str(windowSize))

# Clear cookies and cache via CDP immediately after launch
driver.execute_cdp_cmd("Network.clearBrowserCookies", {})
driver.execute_cdp_cmd("Network.clearBrowserCache", {})
print("[BROWSER] Cookies and cache cleared on launch")

# Inject Referer header via CDP Network so CS/analytics see it on the server side.
# Using Network.enable + setExtraHTTPHeaders matches how browsers naturally send
# the Referer header — more reliable than overriding document.referrer via JS.
driver.execute_cdp_cmd("Network.enable", {})
if referrerUrl:
    driver.execute_cdp_cmd("Network.setExtraHTTPHeaders", {"headers": {"Referer": referrerUrl}})
    print("[MAIN] Referrer injected via CDP: " + referrerUrl)
else:
    print("[MAIN] No referrer set (direct traffic)")


# ---------------------------------------------------------------------------
# Utility helpers
# ---------------------------------------------------------------------------
def log(prefix, msg):
    print("[" + prefix + "] " + msg)

def wait(lo=0.8, hi=2.2):
    time.sleep(random.uniform(lo, hi))

def scroll_to(element):
    driver.execute_script("arguments[0].scrollIntoView({behavior:'smooth',block:'center'})", element)
    time.sleep(random.uniform(0.6, 1.2))

def scroll_by(px, label=""):
    driver.execute_script("window.scrollBy({top:" + str(px) + ",behavior:'smooth'})")
    if label:
        log("SCROLL", label + " — scrolling " + str(px) + "px")
    time.sleep(random.uniform(0.7, 1.4))

def scroll_to_top():
    driver.execute_script("window.scrollTo({top:0,behavior:'smooth'})")
    time.sleep(random.uniform(0.5, 1.0))

def page_height():
    return driver.execute_script("return document.body.scrollHeight")

def hover(element, duration=600):
    try:
        if element.size["width"] == 0 or element.size["height"] == 0:
            return
    except Exception as _e:
        if "invalid session id" in str(_e).lower():
            raise
        return
    ActionChains(driver, duration=duration).move_to_element(element).perform()
    time.sleep(random.uniform(0.4, 0.9))

def hover_click(element, wait_after=2.0):
    try:
        if element.size["width"] == 0 or element.size["height"] == 0:
            return
    except Exception as _e:
        if "invalid session id" in str(_e).lower():
            raise
        return
    ActionChains(driver, duration=random.randint(600, 1000)).move_to_element(element).perform()
    time.sleep(random.uniform(0.3, 0.7))
    element.click()
    time.sleep(wait_after)

def find(element_id, timeout=10):
    return WebDriverWait(driver, timeout).until(
        EC.presence_of_element_located((By.ID, element_id))
    )

def find_clickable(element_id, timeout=10):
    return WebDriverWait(driver, timeout).until(
        EC.element_to_be_clickable((By.ID, element_id))
    )

def try_find(element_id, timeout=5):
    try:
        return WebDriverWait(driver, timeout).until(
            EC.presence_of_element_located((By.ID, element_id))
        )
    except Exception:
        return None

def try_find_css(selector, timeout=5):
    try:
        return WebDriverWait(driver, timeout).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, selector))
        )
    except Exception:
        return None

def full_page_scroll(label="reading page"):
    """Realistic slow scroll through the full page, simulating reading."""
    ph = page_height()
    step = random.randint(300, 500)
    pos  = 0
    log("SCROLL", "Starting full-page scroll — page height = " + str(ph) + "px, step = " + str(step) + "px")
    while pos < ph:
        pos += step
        driver.execute_script("window.scrollBy({top:" + str(step) + ",behavior:'smooth'})")
        time.sleep(random.uniform(0.5, 1.1))
    time.sleep(random.uniform(0.8, 1.5))

def partial_page_scroll(stop_fraction=0.5, label=""):
    """Scroll to a fraction of the page height (simulates not seeing below-fold content)."""
    ph = page_height()
    target = int(ph * stop_fraction)
    step = random.randint(280, 420)
    pos  = 0
    if label:
        log("SCROLL", label + " — scrolling to ~" + str(int(stop_fraction * 100)) + "% of page (" + str(target) + "px)")
    while pos < target:
        pos += step
        driver.execute_script("window.scrollBy({top:" + str(step) + ",behavior:'smooth'})")
        time.sleep(random.uniform(0.5, 1.0))


# ---------------------------------------------------------------------------
# CS tracking helpers
# ---------------------------------------------------------------------------
def cs_check():
    try:
        WebDriverWait(driver, 12).until(
            lambda d: d.execute_script("if(typeof _uxa=='object'){return true;}")
        )
        log("MAIN", "_uxa CS Library confirmed present")
    except Exception:
        log("MAIN", "_uxa not found — CS may not be installed")

def cs_identify():
    driver.execute_script(
        "if(typeof _uxa!=='undefined') _uxa.push(['trackPageEvent','@user-identifier@" + customerEmail + "']);"
    )
    log("MAIN", "CS Identify sent for " + customerEmail)

def cs_var(key, value):
    driver.execute_script(
        "if(typeof _uxa!=='undefined') _uxa.push(['setCustomVariable','" + key + "','" + str(value) + "']);"
    )
    log("MAIN", "CS dynamic variable set: " + key + " = " + str(value))

def cs_event(name):
    driver.execute_script(
        "if(typeof _uxa!=='undefined') _uxa.push(['trackPageEvent','" + name + "']);"
    )
    log("MAIN", "Heap event fired: '" + name + "'")


# ---------------------------------------------------------------------------
# Homepage helpers
# ---------------------------------------------------------------------------
def load_homepage():
    driver.get(startingUrl)
    time.sleep(random.uniform(4, 6))
    log("MAIN", "Page loaded — URL = " + driver.current_url)
    # Verify referrer was received by the page — matches telco script verification pattern
    pageReferrer = driver.execute_script("return document.referrer;")
    log("MAIN", "document.referrer = '" + str(pageReferrer) + "'")
    cs_check()
    cs_identify()
    cs_var("script_name", "csStoreJourneyZoningFunnel")
    cs_var("numberOfPastPurchases", str(customerNumberOfPastPurchases))
    cs_var("customerType", "returning" if isReturningUser else "new")

def click_logo():
    scroll_to_top()
    logo = find_clickable("main-logo")
    hover_click(logo, wait_after=random.uniform(3, 5))
    log("MAIN", "Clicked main-logo — returned to homepage")


# ---------------------------------------------------------------------------
# Nav menu hover + blocked-click simulation (for CSQ zoning on nav)
# ---------------------------------------------------------------------------
def expand_navbar():
    """
    Force the Bootstrap navbar collapse open via JS so nav links have size/position
    in headless mode (where the collapse is display:none by default at 1280px).
    Returns True if expansion was needed, False if it was already open.
    """
    expanded = driver.execute_script(
        "var menu = document.getElementById('catNavMenu');"
        "if (!menu) return false;"
        "if (menu.classList.contains('show')) return false;"
        "menu.classList.add('show');"
        "menu.style.display = 'block';"
        "return true;"
    )
    if expanded:
        # Wait until at least one nav link has rendered size rather than a flat sleep.
        # This prevents nav-element-not-found failures caused by the collapse animation
        # not having fully applied layout before Selenium queries element dimensions.
        try:
            WebDriverWait(driver, 3).until(
                lambda d: d.find_element(By.ID, "nav-cat-sports").size["width"] > 0
            )
        except Exception:
            time.sleep(0.5)
    return expanded

def collapse_navbar():
    """Restore the navbar and all open dropdowns to their natural state after nav interactions."""
    driver.execute_script(
        "var menu = document.getElementById('catNavMenu');"
        "if (menu) { menu.classList.remove('show'); menu.style.display = ''; }"
        "document.querySelectorAll('.dropdown-menu.show').forEach(function(dm) {"
        "  dm.classList.remove('show'); dm.style.display = '';"
        "});"
    )

def simulate_nav_interactions():
    """
    Hover over each top-level nav category, pause to 'read' the dropdown,
    optionally hover over a sub-item, then block the navigation and move on.
    This generates hover/click zone data in CSQ without leaving the page.
    The navbar collapse is force-expanded before interacting so elements have
    size/position in headless mode, then restored afterwards.
    """
    log("MAIN", "Starting nav menu zoning simulation")
    scroll_to_top()
    time.sleep(1)

    # Ensure nav links are visible/interactable in headless mode
    expand_navbar()

    cats_to_hover = topLevelCats.copy()
    random.shuffle(cats_to_hover)
    cats_to_hover = cats_to_hover[:random.randint(2, 4)]

    for catSlug in cats_to_hover:
        navId = "nav-cat-" + catSlug
        navEl = try_find(navId, timeout=5)
        if not navEl:
            log("MAIN", "nav element not found: " + navId + ", skipping")
            continue

        # Verify element has size before attempting hover (safety check for headless)
        el_size = navEl.size
        if el_size["width"] == 0 or el_size["height"] == 0:
            log("MAIN", navId + " has no size — skipping hover")
            continue

        # Hover over parent nav item — opens dropdown
        log("MAIN", "Hovering nav item: " + navId)
        ActionChains(driver, duration=random.randint(500, 900)).move_to_element(navEl).perform()
        time.sleep(random.uniform(1.2, 2.5))  # pause to "read" dropdown

        # Possibly hover a sub-item in the dropdown
        # Force the dropdown menu visible in headless before attempting hover
        if random.random() < 0.7:
            subId = "nav-cat-" + catSlug + "-all"
            driver.execute_script(
                "var menu = document.querySelector('#nav-cat-" + catSlug + "').closest('.nav-item');"
                "if (menu) { var dm = menu.querySelector('.dropdown-menu'); if (dm) { dm.classList.add('show'); dm.style.display='block'; } }"
            )
            time.sleep(0.2)
            subEl = try_find(subId, timeout=3)
            if subEl and subEl.size["width"] > 0:
                ActionChains(driver, duration=random.randint(400, 700)).move_to_element(subEl).perform()
                time.sleep(random.uniform(0.8, 1.5))
            # Hide the dropdown again
            driver.execute_script(
                "var menu = document.querySelector('#nav-cat-" + catSlug + "').closest('.nav-item');"
                "if (menu) { var dm = menu.querySelector('.dropdown-menu'); if (dm) { dm.classList.remove('show'); dm.style.display=''; } }"
            )

        # Inject preventDefault then click — records the click in CSQ zoning
        # but prevents page navigation
        if random.random() < 0.6:
            try:
                driver.execute_script(
                    "var el = document.getElementById('" + navId + "');"
                    "if(el){"
                    "  el._csqBlockHandler = function(e){ e.preventDefault(); };"
                    "  el.addEventListener('click', el._csqBlockHandler, true);"
                    "}"
                )
                navEl.click()
                time.sleep(0.3)
                driver.execute_script(
                    "var el = document.getElementById('" + navId + "');"
                    "if(el && el._csqBlockHandler){"
                    "  el.removeEventListener('click', el._csqBlockHandler, true);"
                    "  delete el._csqBlockHandler;"
                    "}"
                )
                log("MAIN", "Blocked-click fired on " + navId + " (CSQ zoning recorded, no navigation)")
            except Exception as ex:
                log("MAIN", "Blocked-click skipped: " + str(ex))

        time.sleep(random.uniform(0.5, 1.2))

    # Restore navbar to natural state
    collapse_navbar()
    log("MAIN", "Nav menu zoning simulation complete")


# ---------------------------------------------------------------------------
# Homepage scroll strategy (drives golf zoning insight)
#
# ~60% of sessions stop at ~45% of page (above golf promo section)
# ~40% of sessions scroll all the way — exposing golf/basketball promos
# Those who see golf and click it convert at a high rate (see Path 1 / 4)
# ---------------------------------------------------------------------------
def click_promo_banner_aesthetic():
    """Aesthetic-only: click Shop Sale or Shop Running banner. No cs_event/cs_var —
    purely fills out zoning data, never a story-relevant signal for any path."""
    banner_cta = random.choice(["promo-banner-1-cta", "promo-banner-2-cta"])
    el = try_find(banner_cta, timeout=3)
    if not el:
        return None
    scroll_to(el)
    hover_click(el, wait_after=random.uniform(3, 5))
    log("MAIN", "Aesthetic click — promo banner: " + banner_cta)
    return "sale" if banner_cta == "promo-banner-1-cta" else "running"

def click_bestselling_aesthetic():
    """Aesthetic-only: click a random Best Selling product card. No cs_event/cs_var."""
    links = driver.find_elements(By.CSS_SELECTOR, 'a[id^="pc-name-link-"]')
    if not links:
        return None
    el = random.choice(links)
    scroll_to(el)
    hover_click(el, wait_after=random.uniform(3, 5))
    log("MAIN", "Aesthetic click — best-selling product")
    return "bestseller"

def click_category_tile_aesthetic(cat_ids):
    """Aesthetic-only: click a random category tile. No cs_event/cs_var."""
    cid = random.choice(cat_ids)
    el = try_find(cid, timeout=3)
    if not el:
        return None
    scroll_to(el)
    hover_click(el, wait_after=random.uniform(3, 5))
    log("MAIN", "Aesthetic click — category tile: " + cid)
    return "category"

def homepage_scroll_and_interact():
    """Scroll homepage and interact with visible sections for zoning data."""
    scroll_to_top()
    ph = page_height()
    log("MAIN", "Homepage scroll — page height = " + str(ph) + "px")

    cat_ids = ["home-cat-sports", "home-cat-running", "home-cat-lifestyle",
               "home-cat-classics", "home-cat-basketball", "home-cat-golf"]

    sees_golf_promo = random.random() < 0.40  # only 40% scroll far enough

    if not sees_golf_promo:
        # Shallow scroll — stops above the golf/basketball section, but the
        # random stop point (38-50%) often still passes the promo banners
        # (~39%) and sometimes Best Selling (~44%) — gate those aesthetic
        # clicks on the actual roll so they only fire when genuinely visible.
        stop_fraction = random.uniform(0.38, 0.50)
        partial_page_scroll(stop_fraction=stop_fraction,
                            label="shallow scroll (golf promo NOT seen)")
        sees_banners = stop_fraction >= 0.39
        sees_bestselling = stop_fraction >= 0.44

        # Possibly click a category tile or promo banner that IS visible
        if random.random() < 0.5:
            for cid in random.sample(cat_ids[:4], 2):  # only above-fold cats
                el = try_find(cid, timeout=3)
                if el:
                    hover(el)
                    time.sleep(random.uniform(0.5, 1.0))

        # Aesthetic-only clicks below — fill out zoning data, no cs_event/cs_var,
        # no effect on any path's story (see call sites for how the return
        # value is/isn't consumed).
        if random.random() < 0.08:
            result = click_category_tile_aesthetic(cat_ids)
            if result:
                return result

        if sees_banners and random.random() < 0.10:
            result = click_promo_banner_aesthetic()
            if result:
                return result

        if sees_bestselling and random.random() < 0.10:
            result = click_bestselling_aesthetic()
            if result:
                return result

        log("MAIN", "User did not scroll to golf promo section (low exposure, high opportunity)")
        return False  # did NOT see golf promo

    else:
        # Full scroll — user sees golf/basketball promos
        full_page_scroll(label="full homepage read")
        log("MAIN", "User scrolled to golf promo section (exposure recorded)")

        # Hover all 6 category tiles
        for cid in cat_ids:
            el = try_find(cid, timeout=3)
            if el:
                hover(el, duration=400)

        # High probability of clicking golf CTA when seen
        if random.random() < 0.42:
            golf_cta = try_find("golf-promo-cta", timeout=4)
            if golf_cta:
                scroll_to(golf_cta)
                time.sleep(random.uniform(1, 2))
                hover_click(golf_cta, wait_after=random.uniform(4, 6))
                log("MAIN", "User clicked golf promo CTA (high attractiveness conversion)")
                cs_event("GolfPromoClicked")
                cs_var("entryPoint", "golf_promo")
                return "golf"  # signal: came from golf CTA

        # Maybe click basketball CTA
        if random.random() < 0.25:
            bball_cta = try_find("basketball-promo-cta", timeout=4)
            if bball_cta:
                scroll_to(bball_cta)
                hover_click(bball_cta, wait_after=random.uniform(4, 6))
                log("MAIN", "User clicked basketball promo CTA")
                cs_event("BasketballPromoClicked")
                return "basketball"

        # Aesthetic-only additions below — same rationale as the shallow branch.
        if random.random() < 0.20:
            result = click_promo_banner_aesthetic()
            if result:
                return result

        if random.random() < 0.15:
            result = click_bestselling_aesthetic()
            if result:
                return result

        if random.random() < 0.10:
            result = click_category_tile_aesthetic(cat_ids)
            if result:
                return result

        return True  # saw golf but didn't click


# ---------------------------------------------------------------------------
# Promo landing page helpers
# ---------------------------------------------------------------------------
def is_promo_landing():
    """Returns True when the session started on a promo page (utmIndex 0-3)."""
    return utmIndex in (0, 1, 2, 3)

def interact_promo_page():
    """Scroll and interact with the promo landing page, then click the CTA to enter shop."""
    log("MAIN", "Interacting with promo landing page: " + driver.current_url)
    scroll_to_top()
    time.sleep(random.uniform(1.5, 2.5))
    partial_page_scroll(stop_fraction=random.uniform(0.5, 0.9), label="reading promo page")

    # Determine which CTA IDs to look for based on current URL
    current = driver.current_url
    if "summer-sale" in current:
        cta_ids = ["promo-summer-sale-cta", "promo-summer-sale-cta-bottom"]
    elif "new-arrivals" in current:
        cta_ids = ["promo-new-arrivals-cta", "promo-new-arrivals-cta-bottom"]
    elif "running-gear" in current:
        cta_ids = ["promo-running-gear-cta", "promo-running-gear-cta-bottom"]
    else:
        cta_ids = []

    for cta_id in cta_ids:
        el = try_find(cta_id, timeout=10)
        if el and el.size["width"] > 0:
            scroll_to(el)
            hover_click(el, wait_after=random.uniform(3, 5))
            log("MAIN", "Clicked promo CTA: " + cta_id)
            cs_event("PromoCtaClicked")
            cs_var("entryPoint", "promo_page")
            return
    log("MAIN", "No promo CTA found — navigating to shop directly")
    navigate_to_shop(search_term=selectedSearchValue)


# ---------------------------------------------------------------------------
# Account management
# ---------------------------------------------------------------------------
def register_account():
    log("MAIN", "Navigating to registration page")
    driver.get("https://" + siteDomain + "/register")
    time.sleep(random.uniform(3, 5))

    nameField = find_clickable("register-name")
    hover_click(nameField, wait_after=0.5)
    nameField.send_keys(customerFirstName + " " + customerLastName)
    wait(0.5, 1.2)

    emailField = find_clickable("register-email")
    hover_click(emailField, wait_after=0.5)
    emailField.send_keys(customerEmail)
    wait(0.5, 1.2)

    pwField = find_clickable("register-password")
    hover_click(pwField, wait_after=0.5)
    pwField.send_keys(customerPassword)
    wait(0.5, 1.0)

    pwConfirmField = find_clickable("register-password-confirm")
    hover_click(pwConfirmField, wait_after=0.5)
    pwConfirmField.send_keys(customerPassword)
    wait(0.8, 1.5)

    submitBtn = find_clickable("register-submit")
    hover_click(submitBtn, wait_after=0.5)
    log("MAIN", "Registration submitted for " + customerEmail)

    # Wait for redirect away from /register (success → homepage, failure → stays on /register)
    try:
        WebDriverWait(driver, 10).until(lambda d: "/register" not in d.current_url)
    except Exception:
        pass
    time.sleep(random.uniform(1, 2))

    # If the server rejected the registration (e.g. email already taken) it redirects
    # back to /register. Return to homepage first so CS records the correct session
    # entry point, then fall back to login so the session is authenticated.
    if "/register" in driver.current_url:
        log("MAIN", "Registration failed (email likely already taken) — returning to homepage then logging in")
        driver.get(startingUrl)
        time.sleep(random.uniform(2, 3))
        login_account()

def login_account():
    log("MAIN", "Navigating to login page")
    driver.get("https://" + siteDomain + "/login")
    time.sleep(random.uniform(3, 5))

    emailField = find_clickable("login-email")
    hover_click(emailField, wait_after=0.5)
    emailField.send_keys(customerEmail)
    wait(0.5, 1.0)

    pwField = find_clickable("login-password")
    hover_click(pwField, wait_after=0.5)
    pwField.send_keys(customerPassword)
    wait(0.8, 1.5)

    submitBtn = find_clickable("login-submit")
    hover_click(submitBtn, wait_after=random.uniform(4, 6))
    log("MAIN", "Login submitted for " + customerEmail)


# ---------------------------------------------------------------------------
# Shop / catalogue
# ---------------------------------------------------------------------------
def navigate_to_shop(search_term=None, category_slug=None):
    if search_term:
        log("MAIN", "Navigating to shop via search: " + search_term)
        search_input = find_clickable("search-input")
        hover_click(search_input, wait_after=0.5)
        search_input.clear()
        search_input.send_keys(search_term)
        time.sleep(random.uniform(0.8, 1.5))
        search_input.send_keys(Keys.ENTER)
        time.sleep(random.uniform(5, 8))
    elif category_slug:
        log("MAIN", "Navigating to shop via category: " + category_slug)
        driver.get("https://" + siteDomain + "/shop?category=" + category_slug)
        time.sleep(random.uniform(6, 9))
    else:
        log("MAIN", "Navigating to shop (all products)")
        driver.get("https://" + siteDomain + "/shop")
        time.sleep(random.uniform(6, 9))

def select_product(hover_multiple=True):
    """Scroll grid, hover several cards, click one. Returns product id or None."""
    grid = try_find("products-grid", timeout=15)
    if not grid:
        log("MAIN", "products-grid not found")
        return None

    cards = driver.find_elements(By.CSS_SELECTOR, "#products-grid [id^='product-card-']")
    log("MAIN", "numberOfProductsOnPage = " + str(len(cards)))
    if not cards:
        return None

    # Hover over 2-4 cards first (zoning engagement before selecting)
    if hover_multiple and len(cards) > 2:
        to_hover = random.sample(cards, min(random.randint(2, 4), len(cards)))
        for card in to_hover:
            try:
                scroll_to(card)
                hover(card, duration=random.randint(400, 800))
            except Exception:
                pass
        time.sleep(random.uniform(0.5, 1.2))

    selected_card = random.choice(cards)
    product_id = selected_card.get_attribute("id").replace("product-card-", "")
    log("MAIN", "Selected product-card-" + product_id)

    name_link = try_find("pc-name-link-" + product_id, timeout=5)
    if not name_link:
        log("MAIN", "pc-name-link-" + product_id + " not found")
        return None

    scroll_to(name_link)
    hover_click(name_link, wait_after=random.uniform(4, 6))
    log("MAIN", "Navigated to product detail page")
    return product_id

def browse_pdp(tab="description"):
    """Read the PDP — scroll, read tabs, maybe click a thumbnail."""
    scroll_to_top()
    time.sleep(random.uniform(1, 2))

    # Click description or reviews tab
    tab_id = "tab-reviews" if tab == "reviews" else "tab-description"
    tab_el = try_find(tab_id, timeout=5)
    if tab_el:
        scroll_to(tab_el)
        hover_click(tab_el, wait_after=random.uniform(1.5, 2.5))
        log("MAIN", "Clicked PDP tab: " + tab_id)

    # Scroll to read description
    partial_page_scroll(stop_fraction=0.6, label="reading PDP")

    # Maybe click a thumbnail
    if random.random() < 0.65:
        thumbs = driver.find_elements(By.CSS_SELECTOR, "#pd-thumbnails img[id^='pd-thumb-']")
        if thumbs:
            idx = random.randint(0, min(2, len(thumbs) - 1))
            thumb = try_find("pd-thumb-" + str(idx), timeout=3)
            if thumb:
                scroll_to(thumb)
                hover_click(thumb, wait_after=random.uniform(1.5, 2.5))
                log("MAIN", "Clicked thumbnail pd-thumb-" + str(idx))

    scroll_to_top()
    time.sleep(random.uniform(0.5, 1.0))

def add_to_wishlist():
    """Requires user to be logged in. Wishlist button only renders when authenticated."""
    wishlist_btn = try_find("pd-wishlist-btn", timeout=5)
    if not wishlist_btn:
        log("MAIN", "pd-wishlist-btn not found — user not logged in, skipping wishlist")
        return False
    pdp_url = driver.current_url
    scroll_to(wishlist_btn)
    hover_click(wishlist_btn, wait_after=random.uniform(2, 3))
    log("MAIN", "Wishlist button clicked")
    cs_event("ProductWishlisted")
    # Wishlist POST redirects to Referrer — in headless this may be missing, falling back to /.
    # Navigate back to PDP if we've left it.
    if "/product/" not in driver.current_url:
        log("MAIN", "Wishlist redirected away from PDP — returning to " + pdp_url)
        driver.get(pdp_url)
        time.sleep(random.uniform(1.5, 2.5))
    return True

def add_to_cart():
    """Click Add to Cart. Returns True if added, False if out of stock."""
    try:
        stock_el = driver.find_element(By.ID, "pd-stock-status")
        if "Out of Stock" in stock_el.text:
            log("MAIN", "Product out of stock — rage clicking stock status")
            for _ in range(7):
                ActionChains(driver).move_to_element(stock_el).perform()
                stock_el.click()
                time.sleep(0.2)
            log("MAIN", "Rage clicks complete on out-of-stock item")
            cs_event("RageClickOutOfStock")
            return False
    except Exception:
        pass

    atc_btn = try_find("pd-add-to-cart", timeout=15)
    if not atc_btn:
        log("MAIN", "pd-add-to-cart not found — may have already navigated away, skipping")
        return False
    scroll_to(atc_btn)
    hover_click(atc_btn, wait_after=random.uniform(4, 6))
    log("MAIN", "Add-to-cart clicked")
    cs_event("ProductAddedToCart")
    return True


# ---------------------------------------------------------------------------
# Cart helpers
# ---------------------------------------------------------------------------
def view_cart():
    cart_link = find_clickable("nav-cart-link")
    hover_click(cart_link, wait_after=random.uniform(4, 6))
    log("MAIN", "Navigated to cart page")

def cart_increase_qty():
    items = driver.find_elements(By.CSS_SELECTOR, "tr[id^='cart-item-']")
    if items:
        first_id = items[0].get_attribute("id").replace("cart-item-", "")
        inc_btn = try_find("cart-qty-increase-" + first_id, timeout=4)
        if inc_btn:
            scroll_to(inc_btn)
            hover_click(inc_btn, wait_after=random.uniform(2, 3))
            log("MAIN", "Increased qty for cart-item-" + first_id)

def apply_coupon_cart(code="SAVE10"):
    coupon_field = try_find("couponCode", timeout=5)
    if coupon_field:
        scroll_to(coupon_field)
        hover_click(coupon_field, wait_after=0.5)
        coupon_field.send_keys(code)
        wait(0.8, 1.5)
        apply_btn = find_clickable("coupon-apply-btn")
        hover_click(apply_btn, wait_after=random.uniform(2, 3))
        log("MAIN", "Coupon code '" + code + "' applied on cart page")
        cs_event("CouponApplied")

def proceed_to_checkout():
    checkout_btn = find_clickable("proceed-to-checkout")
    scroll_to(checkout_btn)
    hover_click(checkout_btn, wait_after=random.uniform(5, 7))
    log("MAIN", "Proceeded to checkout")


# ---------------------------------------------------------------------------
# API error injection helpers
# These fire real HTTP requests to our demo error endpoints.
# CSQ captures the XHR status + body for Error Analysis.
# ---------------------------------------------------------------------------
def inject_api_error_payment():
    log("MAIN", "Injecting API error: POST /api/payment-verify (503 expected)")
    driver.execute_script("""
        (function() {
            fetch('/api/payment-verify', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({cart_id: 'demo_cart_001', amount: 129.95})
            })
            .then(function(r) {
                return r.json().then(function(body) {
                    if (!r.ok) {
                        var err = new Error('PaymentGatewayUnavailable: ' + body.message);
                        err.code = body.code;
                        throw err;
                    }
                });
            })
            .catch(function(e) {
                console.error('[CSQ-DEMO] Payment API error:', e.message);
                throw e;
            });
        })();
    """)
    time.sleep(random.uniform(1.5, 2.5))
    log("MAIN", "Payment API error injected — CSQ Error Analysis should capture 503 + body")

def inject_api_error_inventory():
    log("MAIN", "Injecting API error: POST /api/inventory-check (500 expected)")
    driver.execute_script("""
        (function() {
            fetch('/api/inventory-check', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({product_id: 'demo_prod_001', sku: 'DEMO-SKU'})
            })
            .then(function(r) {
                return r.json().then(function(body) {
                    if (!r.ok) {
                        var err = new Error('InventoryServiceError: ' + body.message);
                        err.code = body.code;
                        throw err;
                    }
                });
            })
            .catch(function(e) {
                console.error('[CSQ-DEMO] Inventory API error:', e.message);
                throw e;
            });
        })();
    """)
    time.sleep(random.uniform(1.5, 2.5))
    log("MAIN", "Inventory API error injected — CSQ Error Analysis should capture 500 + body")

def inject_api_error_promo():
    log("MAIN", "Injecting API error: POST /api/promo-validate (422 expected)")
    driver.execute_script("""
        (function() {
            fetch('/api/promo-validate', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({coupon_code: 'BROKEN50', cart_total: 45.00})
            })
            .then(function(r) {
                return r.json().then(function(body) {
                    if (!r.ok) {
                        var err = new Error('PromoValidationFailed: ' + body.message);
                        err.code = body.code;
                        throw err;
                    }
                });
            })
            .catch(function(e) {
                console.error('[CSQ-DEMO] Promo API error:', e.message);
                throw e;
            });
        })();
    """)
    time.sleep(random.uniform(1.5, 2.5))
    log("MAIN", "Promo API error injected — CSQ Error Analysis should capture 422 + body")

def inject_js_error(message="CheckoutServiceUnavailable: upstream timeout after 30000ms"):
    log("MAIN", "Injecting JS error: " + message)
    driver.execute_script(
        "setTimeout(function(){ throw new Error('" + message + "'); }, 100);"
    )
    time.sleep(random.uniform(0.8, 1.5))
    log("MAIN", "JS error injected — will appear in CS Error Analysis")


# ---------------------------------------------------------------------------
# Checkout helpers
# ---------------------------------------------------------------------------
def fill_checkout_form(bad_email=False):
    """Fill the checkout shipping form. bad_email=True simulates a typo → correction."""
    name_field = find_clickable("shipping-name")
    scroll_to(name_field)
    ActionChains(driver, duration=700).move_to_element(name_field).perform()
    name_field.click()
    name_field.clear()
    name_field.send_keys(customerFirstName + " " + customerLastName)
    wait(0.5, 1.2)

    email_field = find("shipping-email")
    ActionChains(driver, duration=700).move_to_element(email_field).perform()
    email_field.click()
    email_field.clear()

    if bad_email:
        # Typo then correction — generates Form Analytics event
        typo_email = customerEmail.replace("@", "AT")
        email_field.send_keys(typo_email)
        wait(1.5, 2.5)
        log("MAIN", "Typed bad email (no @): " + typo_email)
        email_field.clear()
        wait(0.5, 1.0)
        email_field.send_keys(customerEmail)
        log("MAIN", "Corrected email to: " + customerEmail)
    else:
        email_field.send_keys(customerEmail)
    wait(0.5, 1.0)

    addr_field = find("shipping-address")
    ActionChains(driver, duration=700).move_to_element(addr_field).perform()
    addr_field.click()
    addr_field.clear()
    addr_field.send_keys(customerStreetAddress)
    wait(0.5, 1.0)

    city_field = find("shipping-city")
    ActionChains(driver, duration=700).move_to_element(city_field).perform()
    city_field.click()
    city_field.clear()
    city_field.send_keys(customerCity)
    wait(0.4, 0.9)

    state_field = find("shipping-state")
    ActionChains(driver, duration=700).move_to_element(state_field).perform()
    state_field.click()
    state_field.clear()
    state_field.send_keys(customerState[:2].upper())
    wait(0.4, 0.9)

    zip_field = find("shipping-zip")
    ActionChains(driver, duration=700).move_to_element(zip_field).perform()
    zip_field.click()
    zip_field.clear()
    zip_field.send_keys(customerPostalCode[:5])
    wait(0.6, 1.2)
    log("MAIN", "Checkout form filled")

def fill_card_fields(abandon_at_number=False):
    """
    Select Credit/Debit Card and fill card fields.
    abandon_at_number=False  — fill all fields cleanly (Path 1 happy purchase)
    abandon_at_number=True   — fill name/expiry, type partial card number then stop (Path 4 abandonment)
    """
    try:
        pm_card = find_clickable("pm_card", timeout=6)
        scroll_to(pm_card)
        hover_click(pm_card, wait_after=random.uniform(1.0, 1.8))
        log("MAIN", "Credit/Debit Card selected")
    except Exception as ex:
        log("MAIN", "pm_card radio not found: " + str(ex))
        return

    cc_name = try_find("cc-name", timeout=6)
    if cc_name:
        scroll_to(cc_name)
        ActionChains(driver, duration=600).move_to_element(cc_name).perform()
        cc_name.click()
        cc_name.send_keys(customerFirstName + " " + customerLastName)
        wait(0.5, 1.0)
        log("MAIN", "cc-name filled")

    cc_expiry = try_find("cc-expiry", timeout=5)
    if cc_expiry:
        scroll_to(cc_expiry)
        ActionChains(driver, duration=500).move_to_element(cc_expiry).perform()
        cc_expiry.click()
        expiry_month = str(random.randint(1, 12)).zfill(2)
        expiry_year  = str(random.randint(27, 31))
        cc_expiry.send_keys(expiry_month + expiry_year)
        wait(0.5, 1.0)
        log("MAIN", "cc-expiry filled")

    cc_number = try_find("cc-number", timeout=5)
    if cc_number:
        scroll_to(cc_number)
        ActionChains(driver, duration=700).move_to_element(cc_number).perform()
        cc_number.click()
        time.sleep(random.uniform(1.0, 2.0))

        if abandon_at_number:
            # Type partial card number then stop — Form Analytics captures the drop-off
            partial = "4532" + str(random.randint(10, 99))
            for ch in partial:
                cc_number.send_keys(ch)
                time.sleep(random.uniform(0.18, 0.35))
            log("MAIN", "Partial card number entered (" + partial + ") — abandoning here")
            cs_event("CardNumberAbandoned")
            return
        else:
            # Full card number — spaced as 4-4-4-4
            full_number = "4532" + str(random.randint(100000000000, 999999999999))
            groups = [full_number[i:i+4] for i in range(0, 16, 4)]
            for i, group in enumerate(groups):
                for ch in group:
                    cc_number.send_keys(ch)
                    time.sleep(random.uniform(0.10, 0.25))
                if i < 3:
                    time.sleep(random.uniform(0.2, 0.5))
            log("MAIN", "cc-number filled")
            wait(0.4, 0.8)

    if not abandon_at_number:
        cc_cvv = try_find("cc-cvv", timeout=5)
        if cc_cvv:
            scroll_to(cc_cvv)
            ActionChains(driver, duration=500).move_to_element(cc_cvv).perform()
            cc_cvv.click()
            cc_cvv.send_keys(str(random.randint(100, 999)))
            wait(0.4, 0.8)
            log("MAIN", "cc-cvv filled")


def place_order():
    try:
        total_el = driver.find_element(By.ID, "checkout-total-amount")
        order_total = total_el.text.replace("$", "").strip()
        log("MAIN", "orderTotal = " + order_total)
    except Exception:
        order_total = "0.00"

    cs_identify()
    cs_var("orderTotal", order_total)

    place_btn = find_clickable("place-order-btn")
    scroll_to(place_btn)
    hover_click(place_btn, wait_after=random.uniform(12, 18))
    log("MAIN", "place-order-btn clicked")

def verify_order_confirmation():
    try:
        WebDriverWait(driver, 15).until(
            EC.presence_of_element_located((By.ID, "order-confirmation-header"))
        )
        order_num = driver.find_element(By.ID, "confirmation-order-number").text
        log("MAIN", "Order confirmed! order_number = " + order_num)
        cs_identify()
        cs_var("orderPlaced", "true")
        cs_event("OrderPlaced")
        return True
    except Exception:
        log("MAIN", "Order confirmation page not detected")
        return False


# ===========================================================================
# PATH IMPLEMENTATIONS
# ===========================================================================

# ---------------------------------------------------------------------------
# PATH 1 — Happy Purchase (~8%)
# Clean end-to-end: homepage → nav hover → browse → PDP → cart → checkout → order
# Optionally arrives via golf promo (high-converting below-fold content)
# ---------------------------------------------------------------------------
def path_happy_purchase():
    log("PATH1", "=" * 40 + " Happy Purchase " + "=" * 40)

    if is_promo_landing():
        # Realistic flow: user arrives via promo, browses anonymously, registers at checkout
        simulate_nav_interactions()
        interact_promo_page()
    else:
        # Homepage flow: authenticate first, then browse
        if isReturningUser:
            login_account()
        else:
            register_account()
        click_logo()
        simulate_nav_interactions()
        golf_result = homepage_scroll_and_interact()
        if golf_result == "golf":
            log("PATH1", "Entered shop via golf promo CTA")
        elif golf_result == "basketball":
            log("PATH1", "Entered shop via basketball promo CTA")
            click_logo()
            navigate_to_shop(search_term=selectedSearchValue)
        elif golf_result in ("sale", "running", "bestseller", "category"):
            # Aesthetic-only homepage click already navigated away — no need
            # to repeat navigation, same handling as the golf CTA case.
            log("PATH1", "Entered shop via homepage click (" + golf_result + ")")
        else:
            click_logo()
            navigate_to_shop(search_term=selectedSearchValue)

    # Filter/sort with moderate probability
    if random.random() < 0.55:
        sort_el = try_find("filter-sort", timeout=5)
        if sort_el:
            sort_val = random.choice(["price_asc", "newest", "name"])
            scroll_to(sort_el)
            Select(sort_el).select_by_value(sort_val)
            wait(0.5, 1.0)
            apply_btn = try_find("filter-apply", timeout=4)
            if apply_btn:
                hover_click(apply_btn, wait_after=random.uniform(4, 6))
                log("PATH1", "Sort applied: " + sort_val)

    select_product(hover_multiple=True)
    browse_pdp(tab=random.choice(["description", "description", "reviews"]))

    if is_promo_landing() and not isReturningUser:
        # Register now — anonymous new user hit a point requiring auth (wishlist)
        log("PATH1", "Promo landing — registering before wishlist/checkout")
        pdp_url = driver.current_url
        register_account()
        log("PATH1", "Post-registration URL: " + driver.current_url)
        time.sleep(random.uniform(8, 10))
        # Registration redirects to homepage — navigate back to PDP directly
        driver.get(pdp_url)
        log("PATH1", "Returned to PDP: " + driver.current_url)
        try:
            WebDriverWait(driver, 12).until(
                EC.presence_of_element_located((By.ID, "pd-wishlist-btn"))
            )
            log("PATH1", "pd-wishlist-btn found after PDP reload")
        except Exception:
            log("PATH1", "pd-wishlist-btn still not found after PDP reload")
        time.sleep(random.uniform(1, 2))

    add_to_wishlist()
    added = add_to_cart()
    if not added:
        log("PATH1", "Out of stock — aborting happy path")
        return

    view_cart()
    scroll_to_top()
    partial_page_scroll(0.5, "reading cart")

    if random.random() < 0.35:
        apply_coupon_cart("SAVE10")

    cart_increase_qty()
    proceed_to_checkout()

    fill_checkout_form(bad_email=random.random() < 0.30)
    cs_var("checkoutStarted", "true")
    fill_card_fields(abandon_at_number=False)

    place_order()
    confirmed = verify_order_confirmation()
    if confirmed:
        log("PATH1", "Happy purchase complete — order confirmed")
        cs_var("revenueImpact", "positive")
        time.sleep(random.uniform(2, 4))

        if random.random() < 0.5:
            # Check order history — user reviewing their purchase
            log("PATH1", "Navigating to order history")
            driver.get("https://" + siteDomain + "/orders")
            time.sleep(random.uniform(3, 5))
            log("PATH1", "Order history URL: " + driver.current_url)
            partial_page_scroll(0.6, "reading order history")

            # Click into the first order for detail view
            order_link = try_find_css("a[href^='/orders/']", timeout=8)
            if order_link:
                hover_click(order_link, wait_after=random.uniform(2, 4))
                partial_page_scroll(0.7, "reading order detail")
                log("PATH1", "Viewed order detail page")
            else:
                log("PATH1", "No order link found — current URL: " + driver.current_url)
        else:
            try:
                cont_btn = find_clickable("confirmation-continue-shopping", timeout=6)
                hover_click(cont_btn, wait_after=random.uniform(3, 5))
                log("PATH1", "Continued shopping after order")
            except Exception:
                click_logo()


# ---------------------------------------------------------------------------
# PATH 2 — Wishlist & Bounce (~25%)
# Logs in, browses multiple products, wishlists items, then exits
# ---------------------------------------------------------------------------
def path_wishlist_bounce():
    log("PATH2", "=" * 40 + " Wishlist & Bounce " + "=" * 40)

    if is_promo_landing():
        # Realistic flow: user arrives via promo, browses anonymously, registers when they try to wishlist
        simulate_nav_interactions()
        interact_promo_page()
    else:
        # Homepage flow: authenticate first, then browse
        if isReturningUser:
            login_account()
        else:
            register_account()
        click_logo()
        simulate_nav_interactions()
        homepage_scroll_and_interact()
        click_logo()
        if random.random() < 0.5:
            navigate_to_shop(category_slug=random.choice(categorySlugTerms))
        else:
            navigate_to_shop(search_term=selectedSearchValue)

    # Browse 2-3 products, wishlist them
    registered_mid_session = False
    for i in range(random.randint(2, 3)):
        log("PATH2", "Browsing product " + str(i + 1))
        if i > 0:
            driver.back()
            time.sleep(random.uniform(2, 4))

        pid = select_product(hover_multiple=(i == 0))
        if not pid:
            break

        browse_pdp(tab="description")

        # On first wishlist attempt in promo flow, register mid-session then return to PDP
        if is_promo_landing() and not isReturningUser and not registered_mid_session:
            log("PATH2", "Promo landing — registering before first wishlist")
            pdp_url = driver.current_url
            register_account()
            registered_mid_session = True
            time.sleep(random.uniform(8, 10))
            # Registration redirects to homepage — navigate back to PDP directly
            driver.get(pdp_url)
            try:
                WebDriverWait(driver, 10).until(
                    EC.presence_of_element_located((By.ID, "pd-wishlist-btn"))
                )
            except Exception:
                pass
            time.sleep(random.uniform(1, 2))

        add_to_wishlist()
        wait(1, 2)

    # Go to wishlist page and read it
    wishlist_link = try_find("nav-wishlist-link", timeout=5)
    if wishlist_link:
        hover_click(wishlist_link, wait_after=random.uniform(3, 5))
        partial_page_scroll(0.7, "reading wishlist")
        log("PATH2", "Viewed wishlist page")

    log("PATH2", "User bounced — wishlist saved, no purchase")
    cs_var("sessionOutcome", "wishlist_bounce")


# ---------------------------------------------------------------------------
# PATH 3 — Search & Browse Only (~30%)
# Searches, applies filters, reads multiple PDPs, never converts
# ---------------------------------------------------------------------------
def path_search_browse():
    log("PATH3", "=" * 40 + " Search & Browse Only " + "=" * 40)

    # No registration — anonymous session
    simulate_nav_interactions()
    homepage_scroll_and_interact()

    # Maybe click a hero CTA
    if random.random() < 0.5:
        cta_id = "hero-slide-" + str(heroSlide) + "-cta"
        cta = try_find(cta_id, timeout=4)
        if cta:
            scroll_to(cta)
            hover_click(cta, wait_after=random.uniform(4, 6))
            log("PATH3", "Clicked hero CTA: " + cta_id)
        click_logo()

    if random.random() < 0.5:
        navigate_to_shop(category_slug=random.choice(categorySlugTerms))
    else:
        navigate_to_shop(search_term=selectedSearchValue)

    # Apply a filter
    if random.random() < 0.6:
        cat_slug = random.choice(allSubCats)
        cat_link = try_find("filter-cat-" + cat_slug, timeout=4)
        if cat_link:
            scroll_to(cat_link)
            hover_click(cat_link, wait_after=random.uniform(4, 6))
            log("PATH3", "Category filter applied: " + cat_slug)

    # Browse 1-2 products, read but don't buy
    for i in range(random.randint(1, 2)):
        pid = select_product(hover_multiple=True)
        if not pid:
            break
        browse_pdp(tab=random.choice(["description", "reviews"]))
        wait(1, 2)
        if i < 1:
            driver.back()
            time.sleep(random.uniform(2, 4))

    log("PATH3", "User browsed but did not convert")
    cs_var("sessionOutcome", "browse_no_purchase")


# ---------------------------------------------------------------------------
# PATH 4 — Cart Abandonment (~20%)
# Adds to cart, optionally starts checkout with promo API error, then abandons
# ---------------------------------------------------------------------------
def path_cart_abandonment():
    log("PATH4", "=" * 40 + " Cart Abandonment " + "=" * 40)

    simulate_nav_interactions()
    homepage_scroll_and_interact()
    click_logo()

    navigate_to_shop(search_term=selectedSearchValue)
    pid = select_product(hover_multiple=True)
    if not pid:
        log("PATH4", "No product found — path ends early")
        return

    browse_pdp(tab="description")

    # Inventory API error fires on the PDP before add-to-cart
    inject_api_error_inventory()

    added = add_to_cart()
    if not added:
        return

    view_cart()

    # Promo API error on cart page
    inject_api_error_promo()

    # Try a coupon, see it fail
    coupon_field = try_find("couponCode", timeout=4)
    if coupon_field:
        scroll_to(coupon_field)
        hover_click(coupon_field, wait_after=0.5)
        coupon_field.send_keys("BROKEN50")
        wait(0.8, 1.5)
        apply_btn = try_find("coupon-apply-btn", timeout=4)
        if apply_btn:
            hover_click(apply_btn, wait_after=random.uniform(2, 3))
            log("PATH4", "Attempted invalid coupon BROKEN50")

    # Sometimes proceed to checkout then abandon there
    if random.random() < 0.55:
        proceed_to_checkout()
        fill_checkout_form()
        cs_var("checkoutStarted", "true")
        # Partially fill card fields then abandon — concentrated drop-off on card number
        fill_card_fields(abandon_at_number=True)
        time.sleep(random.uniform(3, 6))
        log("PATH4", "User abandoned on checkout page — did not place order")
        cs_var("sessionOutcome", "checkout_abandonment")
        cs_var("revenueImpact", "lost")
    else:
        log("PATH4", "User abandoned on cart page")
        cs_var("sessionOutcome", "cart_abandonment")
        cs_var("revenueImpact", "lost")


# ---------------------------------------------------------------------------
# PATH 5 — Frustrated Researcher (~17%)
# JS error, rage clicks, navigation looping, exits in frustration
# This path generates the most visible revenue impact in CSQ
# ---------------------------------------------------------------------------
def path_frustrated():
    log("PATH5", "=" * 40 + " Frustrated Researcher " + "=" * 40)

    cs_event("FrustratedPathStart")

    # UTM: broken campaign — inject JS error immediately on landing
    log("PATH5", "UTM: BrokenCampaign — injecting JS error and disabling plan clicks")
    inject_js_error("CheckoutServiceUnavailable: upstream timeout after 30000ms")

    simulate_nav_interactions()

    # Scroll homepage reading plan cards section
    full_page_scroll(label="frustrated user reading homepage")

    # Try to click a category tile but simulate it being unresponsive
    log("PATH5", "User attempting to navigate — CTAs appear broken")
    for cat_id in ["home-cat-running", "home-cat-sports"]:
        el = try_find(cat_id, timeout=3)
        if el:
            scroll_to(el)
            hover(el)
            # Rage click the tile (5 rapid clicks)
            for _ in range(5):
                try:
                    el.click()
                    time.sleep(0.15)
                except Exception:
                    pass
            log("PATH5", "Rage clicked " + cat_id)
            cs_event("RageClick_CategoryTile")
            time.sleep(random.uniform(1, 2))

    # Navigate to shop anyway
    navigate_to_shop(search_term=selectedSearchValue)
    pid = select_product(hover_multiple=False)

    if pid:
        browse_pdp(tab="description")

        # Inventory error on PDP
        inject_api_error_inventory()

        # Rage click add-to-cart after "error"
        atc = try_find("pd-add-to-cart", timeout=5)
        if atc:
            scroll_to(atc)
            hover(atc)
            log("PATH5", "Rage clicking add-to-cart (appears unresponsive)")
            for _ in range(8):
                try:
                    atc.click()
                    time.sleep(0.18)
                except Exception:
                    pass
            cs_event("RageClick_AddToCart")
            time.sleep(random.uniform(2, 3))

        # Add actually works — go to cart.
        # Rage clicks above may have already submitted the form and navigated to /cart,
        # so only call add_to_cart() if still on the PDP.
        if "/cart" not in driver.current_url and "/product/" in driver.current_url:
            add_to_cart()
        else:
            log("PATH5", "Rage clicks already navigated to cart — skipping second add_to_cart()")
        view_cart()

        # Navigation loop: cart → homepage → shop → cart → homepage
        log("PATH5", "Looping navigation — user is frustrated and confused")
        for loop in range(3):
            log("PATH5", "Navigation loop " + str(loop + 1) + " of 3")
            click_logo()
            time.sleep(random.uniform(1.5, 3))
            driver.get("https://" + siteDomain + "/shop")
            time.sleep(random.uniform(3, 5))
            view_cart()
            time.sleep(random.uniform(2, 4))
            cs_event("NavigationLoop_" + str(loop + 1))

        # Proceed to checkout — payment API error fires
        proceed_to_checkout()
        fill_checkout_form(bad_email=True)

        # Frustrated user switches to COD — trying to bypass card entry
        try:
            pm_cod = find_clickable("pm_cod", timeout=6)
            scroll_to(pm_cod)
            hover_click(pm_cod, wait_after=random.uniform(1.0, 1.8))
            log("PATH5", "Frustrated user selected Cash on Delivery to avoid card fields")
        except Exception:
            log("PATH5", "pm_cod not found — skipping payment method switch")

        # Payment error injection before placing order
        inject_api_error_payment()

        # JS error for good measure
        inject_js_error("PaymentProcessor: connection refused — please retry")

        # Rage click place order
        place_btn = try_find("place-order-btn", timeout=6)
        if place_btn:
            scroll_to(place_btn)
            hover(place_btn)
            log("PATH5", "Rage clicking place-order-btn (payment appears broken)")
            for _ in range(9):
                try:
                    place_btn.click()
                    time.sleep(0.2)
                except Exception:
                    pass
            cs_event("RageClick_PlaceOrder")
            time.sleep(random.uniform(2, 4))

        log("PATH5", "User exits in frustration — order never placed")
        cs_var("sessionOutcome", "frustrated_exit")
        cs_var("revenueImpact", "lost_frustrated")
        cs_var("frustrationSignals", "rage_clicks_js_error_api_503_loop")
        cs_event("FrustratedExit")


# ---------------------------------------------------------------------------
# PATH 6 — Homepage Rage Bounce / Broken Campaign (~5% random + all BrokenCampaign UTM)
# User arrives from a broken Instagram campaign. A JS error fires on load,
# hero/category CTAs are disabled, user rage clicks and hard-bounces.
#
# CSQ demo story:
#   Error Analysis  — JS error correlated 100% with this UTM campaign
#   Zoning          — rage click concentration on hero CTAs and category tiles
#   Session Replay  — watch user try and fail to navigate anywhere
#   Journey         — 100% single-page bounce from this UTM campaign
#   Impact Analysis — revenue lost attributed to this broken campaign segment
# ---------------------------------------------------------------------------
def path_homepage_rage_bounce():
    log("PATH6", "=" * 40 + " Homepage Rage Bounce (Broken Campaign) " + "=" * 40)
    log("PATH6", "UTM: BrokenCampaign — injecting JS error and disabling CTA clicks")

    # Inject a realistic-looking JS error that appears in CS Error Analysis
    # tied to this UTM campaign segment
    driver.execute_script("""
        window.addEventListener('load', function() {
            setTimeout(function() {
                try {
                    var shopModule = undefined;
                    shopModule.init({ context: 'homepage' });
                } catch(e) {
                    var err = new Error("Uncaught TypeError: Cannot read properties of undefined (reading 'init') — shop.bundle.js:112");
                    err.stack = "TypeError: Cannot read properties of undefined (reading 'init')\\n    at initShopModule (shop.bundle.js:112:18)\\n    at onDOMReady (app.bundle.js:88:5)";
                    console.error(err);
                    window.__injectedShopError = err.message;
                }
            }, 600);
        });
    """)
    log("PATH6", "JS error injected — will appear in CS Error Analysis")

    # Disable clicks on hero CTAs and category tiles so they appear broken
    driver.execute_script("""
        function disableHomepageCTAs() {
            var selectors = [
                'a[id^="hero-slide-"]',
                'a[id^="home-cat-"]',
                'a[id^="promo-banner-"]',
                '#nav-sale-link'
            ];
            selectors.forEach(function(sel) {
                document.querySelectorAll(sel).forEach(function(el) {
                    el.addEventListener('click', function(e) {
                        e.preventDefault();
                    }, true);
                    el.style.cursor = 'pointer';
                });
            });
        }
        if (document.readyState === 'complete') {
            disableHomepageCTAs();
        } else {
            window.addEventListener('load', disableHomepageCTAs);
        }
    """)
    log("PATH6", "Homepage CTA click handlers disabled — CTAs are now dead")

    # Brief hero section read — user lands and starts scanning
    time.sleep(random.uniform(2.0, 3.5))
    log("PATH6", "User reading homepage — URL = " + driver.current_url)

    # Scroll to plan cards section
    partial_page_scroll(stop_fraction=0.45, label="scrolling to category/hero section")
    time.sleep(random.uniform(1.0, 2.0))

    # First rage target: hero CTA on the visible carousel slide
    rage_target_id = "hero-slide-" + str(heroSlide) + "-cta"
    rage_el = try_find(rage_target_id, timeout=5)
    if not rage_el:
        rage_target_id = "hero-slide-1-cta"
        rage_el = try_find(rage_target_id, timeout=5)

    if rage_el:
        # Force the target carousel slide to be the active one so the CTA
        # has rendered size in headless mode (inactive slides are display:none).
        slide_index = heroSlide - 1  # Bootstrap carousel.to() is 0-based
        driver.execute_script("""
            var items = document.querySelectorAll('#heroCarousel .carousel-item');
            items.forEach(function(item, idx) {
                item.classList.remove('active');
                item.style.display = 'none';
            });
            if (items[arguments[0]]) {
                items[arguments[0]].classList.add('active');
                items[arguments[0]].style.display = 'block';
            }
        """, slide_index)
        time.sleep(0.5)
        log("PATH6", "Forced carousel slide " + str(heroSlide) + " active for headless rendering")

        # Re-fetch after JS manipulation so Selenium has the current element state
        rage_el = try_find(rage_target_id, timeout=5)
        if not rage_el or rage_el.size["width"] == 0 or rage_el.size["height"] == 0:
            log("PATH6", "rage target still has no size after carousel fix — skipping rage clicks")
        else:
            scroll_to(rage_el)
            log("PATH6", "Located rage target: " + rage_target_id)

            # Normal first click — user thinks they just missed
            ActionChains(driver, duration=500).move_to_element(rage_el).perform()
            time.sleep(random.uniform(1.0, 1.8))
            rage_el.click()
            log("PATH6", "Rage click 1 — normal speed")
            time.sleep(random.uniform(0.8, 1.5))

            # Second click — impatience growing
            try:
                ActionChains(driver, duration=400).move_to_element_with_offset(rage_el, random.randint(-3, 3), random.randint(-2, 2)).perform()
            except Exception:
                pass
            rage_el.click()
            log("PATH6", "Rage click 2 — slight impatience")
            time.sleep(random.uniform(0.4, 0.8))

            # Rapid rage phase — jitter relative to element centre so cursor
            # never drifts out of viewport bounds regardless of element position
            rage_count = random.randint(5, 8)
            log("PATH6", "Entering rapid rage phase — " + str(rage_count) + " more clicks")
            for i in range(rage_count):
                try:
                    ActionChains(driver, duration=random.randint(60, 160)).move_to_element_with_offset(
                        rage_el, random.randint(-4, 4), random.randint(-3, 3)
                    ).perform()
                except Exception:
                    pass
                rage_el.click()
                log("PATH6", "Rage click " + str(i + 3) + " — rapid")
                time.sleep(random.uniform(0.06, 0.22))

        cs_event("RageClick_HeroCTA")

        # Post-rage pause — user stares at the screen
        stare_time = random.uniform(2.5, 4.5)
        log("PATH6", "Post-rage pause — staring at screen for " + str(round(stare_time, 1)) + "s")
        time.sleep(stare_time)

    # Try a category tile next — same broken behaviour
    cat_id = "home-cat-" + random.choice(["sports", "running", "lifestyle"])
    cat_el = try_find(cat_id, timeout=4)
    if cat_el:
        scroll_to(cat_el)
        hover(cat_el)
        time.sleep(random.uniform(0.8, 1.5))
        rage_count2 = random.randint(3, 6)
        log("PATH6", "Rage clicking category tile: " + cat_id + " (" + str(rage_count2) + " clicks)")
        for i in range(rage_count2):
            try:
                cat_el.click()
                time.sleep(random.uniform(0.08, 0.20))
            except Exception:
                pass
        cs_event("RageClick_CategoryTile")
        time.sleep(random.uniform(1.5, 3.0))

    # Hard bounce — no navigation, session ends on homepage
    log("PATH6", "Hard bounce — user exits from homepage with zero pageviews beyond entry")
    log("PATH6", "URL at exit = " + driver.current_url)
    cs_var("sessionOutcome", "rage_bounce")
    cs_var("revenueImpact", "lost_broken_campaign")
    cs_event("HardBounce_BrokenCampaign")
    log("PATH6", "=" * 40 + " Path 6 complete " + "=" * 40)


# ---------------------------------------------------------------------------
# PATH 7 — Checkout Card Abandonment (~8%)
# Known user logs in, adds to cart, fills shipping, selects Credit/Debit,
# types partial card number, navigates away to PDP (purchase anxiety loop),
# returns to checkout, tries card number again, leaves again — never completes.
#
# CSQ demo story:
#   Form Analytics  — card number field is the clear drop-off spike
#   Journey         — checkout → PDP → checkout → PDP → exit (confusion loop)
#   Session Replay  — hesitation and backtracking at the card number field
#   Zoning          — engagement concentrated on payment section before drop
# ---------------------------------------------------------------------------
def path_checkout_card_abandonment():
    log("PATH7", "=" * 40 + " Checkout Card Abandonment " + "=" * 40)

    login_account()
    click_logo()

    simulate_nav_interactions()

    if random.random() < 0.5:
        navigate_to_shop(category_slug=random.choice(categorySlugTerms))
    else:
        navigate_to_shop(search_term=selectedSearchValue)

    pid = select_product(hover_multiple=True)
    if not pid:
        log("PATH7", "No product found — path ends early")
        return

    browse_pdp(tab=random.choice(["description", "reviews"]))

    # Store PDP URL — we'll return here during the checkout loop
    pdp_url = driver.current_url
    log("PATH7", "PDP URL stored for loop-back: " + pdp_url)

    added = add_to_cart()
    if not added:
        log("PATH7", "Out of stock — aborting")
        return

    view_cart()
    scroll_to_top()
    partial_page_scroll(0.5, "reading cart before checkout")
    time.sleep(random.uniform(1, 2))

    proceed_to_checkout()

    # Fill all shipping fields — user is committed enough to get this far
    fill_checkout_form(bad_email=False)
    cs_var("checkoutStarted", "true")
    time.sleep(random.uniform(1, 2))

    # Select Credit/Debit Card radio
    log("PATH7", "Selecting Credit/Debit Card payment method")
    try:
        pm_card = find_clickable("pm_card")
        scroll_to(pm_card)
        hover_click(pm_card, wait_after=random.uniform(1.5, 2.5))
        log("PATH7", "Credit/Debit selected — card fields now visible")
    except Exception as ex:
        log("PATH7", "pm_card radio not found: " + str(ex))

    # Fill Name on Card cleanly
    cc_name = try_find("cc-name", timeout=6)
    if cc_name:
        scroll_to(cc_name)
        ActionChains(driver, duration=600).move_to_element(cc_name).perform()
        cc_name.click()
        cc_name.send_keys(customerFirstName + " " + customerLastName)
        wait(0.6, 1.2)
        log("PATH7", "Name on card filled")

    # Fill Expiry cleanly
    cc_expiry = try_find("cc-expiry", timeout=5)
    if cc_expiry:
        scroll_to(cc_expiry)
        ActionChains(driver, duration=500).move_to_element(cc_expiry).perform()
        cc_expiry.click()
        expiry_month = str(random.randint(1, 12)).zfill(2)
        expiry_year  = str(random.randint(27, 31))
        cc_expiry.send_keys(expiry_month + expiry_year)
        wait(0.5, 1.0)
        log("PATH7", "Expiry filled")

    # ---- First hesitation at card number ----
    cc_number = try_find("cc-number", timeout=5)
    if cc_number:
        scroll_to(cc_number)
        ActionChains(driver, duration=700).move_to_element(cc_number).perform()
        cc_number.click()
        time.sleep(random.uniform(1.5, 2.5))  # user stares at the field
        log("PATH7", "Focused card number field — user hesitating")

        # Type 6-8 digits slowly
        partial_card = "4532" + str(random.randint(10, 99))
        for ch in partial_card:
            cc_number.send_keys(ch)
            time.sleep(random.uniform(0.15, 0.35))
        log("PATH7", "Typed partial card number: " + partial_card)

        # Pause — then clear and navigate away (purchase anxiety)
        time.sleep(random.uniform(2.5, 4.0))
        cc_number.send_keys(Keys.CONTROL + "a")
        cc_number.send_keys(Keys.DELETE)
        time.sleep(random.uniform(0.5, 1.0))
        log("PATH7", "Cleared card number — navigating back to PDP")
        cs_event("CardNumberAbandoned")

    # First loop: checkout → PDP
    driver.get(pdp_url)
    time.sleep(random.uniform(2, 3))
    log("PATH7", "Loop 1: back on PDP — " + driver.current_url)
    scroll_to_top()
    time.sleep(random.uniform(1, 2))
    partial_page_scroll(stop_fraction=random.uniform(0.4, 0.7), label="re-reading PDP (price check)")
    time.sleep(random.uniform(6, 10))
    cs_event("CheckoutLoopToPDP_1")

    # Return to checkout
    checkout_url = "https://" + siteDomain + "/checkout"
    driver.get(checkout_url)
    time.sleep(random.uniform(3, 5))
    log("PATH7", "Returned to checkout: " + driver.current_url)

    # Re-select Credit/Debit (form is blank on reload — go straight to payment section)
    try:
        pm_card2 = find_clickable("pm_card", timeout=8)
        scroll_to(pm_card2)
        hover_click(pm_card2, wait_after=random.uniform(1.0, 2.0))
        log("PATH7", "Re-selected Credit/Debit on return visit")
    except Exception:
        log("PATH7", "pm_card not found on return — may have already been selected")

    # ---- Second hesitation at card number ----
    cc_number2 = try_find("cc-number", timeout=6)
    if cc_number2:
        scroll_to(cc_number2)
        ActionChains(driver, duration=600).move_to_element(cc_number2).perform()
        cc_number2.click()
        time.sleep(random.uniform(2.0, 3.5))  # longer stare this time
        log("PATH7", "Focused card number field again — second hesitation")

        # Type fewer digits than before — user is more hesitant
        partial_card2 = "4532" + str(random.randint(10, 29))
        for ch in partial_card2:
            cc_number2.send_keys(ch)
            time.sleep(random.uniform(0.2, 0.4))
        log("PATH7", "Typed partial card number (2nd attempt): " + partial_card2)

        time.sleep(random.uniform(3.0, 5.0))
        log("PATH7", "User abandons card number field again — navigating back to PDP")
        cs_event("CardNumberAbandoned_2")

    # Second loop: checkout → PDP — session ends here, no return
    driver.get(pdp_url)
    time.sleep(random.uniform(2, 3))
    log("PATH7", "Loop 2: back on PDP — session ends here")
    partial_page_scroll(stop_fraction=random.uniform(0.3, 0.6), label="final PDP read before exit")
    time.sleep(random.uniform(5, 9))
    cs_event("CheckoutLoopToPDP_2")

    log("PATH7", "User exits — card number field abandoned twice, order never placed")
    cs_var("sessionOutcome", "card_abandonment_loop")
    cs_var("revenueImpact", "lost_payment_hesitation")
    cs_event("CheckoutCardAbandonment")


# ===========================================================================
# DEBUG OVERRIDES
# Uncomment any line below to force a specific value for this run.
# All overrides are ignored in production — comment them out when done.
# ===========================================================================

# -- Path selection --
# Forces a specific journey path regardless of weighted random selection.
# 1 = Happy Purchase  2 = Wishlist & Bounce  3 = Search & Browse Only
# 4 = Cart Abandonment  5 = Frustrated Researcher  6 = Homepage Rage Bounce
# 7 = Checkout Card Abandonment
# selectedPath = 1

# -- Search term --
# Overrides the randomly chosen search keyword used when navigating to /shop.
# selectedSearchValue = "nike"

# -- Hero carousel slide --
# Controls which hero slide CTA is clicked in paths that use it (1, 2, or 3).
# heroSlide = 2

# -- UTM variant --
# Forces a specific UTM-coded starting URL (index 0-6, see utmVariants list above).
# Index 6 = BrokenCampaign — also auto-forces selectedPath = 6.
# utmIndex = 0

# -- Referrer URL --
# Forces a specific document.referrer injected via CDP.
# Set to None to simulate a direct/typed visit.
# referrerUrl = "https://www.google.com/"
# referrerUrl = None

# ===========================================================================
# Rebuild startingUrl if utmIndex was overridden above
# ===========================================================================
startingUrl = "https://" + siteDomain + utmVariants[utmIndex] + "&sessionReplay=true&sessionReplayName=csStoreJourneyZoningFunnel"
selectedPathName = PATH_NAMES[selectedPath - 1]

print("[INIT] " + "=" * 60)
print("[INIT] DEBUG — final resolved values:")
print("[INIT]   selectedPath     = " + str(selectedPath) + " (" + selectedPathName + ")")
print("[INIT]   selectedSearch   = " + selectedSearchValue)
print("[INIT]   heroSlide        = " + str(heroSlide))
print("[INIT]   utmIndex         = " + str(utmIndex))
print("[INIT]   referrerUrl      = " + str(referrerUrl))
print("[INIT]   startingUrl      = " + startingUrl)
print("[INIT] " + "=" * 60)

# ===========================================================================
# [MAIN] Programme entry point
# ===========================================================================
try:
    log("MAIN", "Loading starting URL: " + startingUrl)
    load_homepage()

    log("MAIN", "Executing path " + str(selectedPath) + ": " + selectedPathName)
    log("MAIN", "isReturningUser = " + str(isReturningUser))
    cs_var("selectedPath", str(selectedPath))
    cs_var("pathName", selectedPathName)
    cs_var("customerType", "returning" if isReturningUser else "new")

    driver.execute_script(
        "if(typeof _uxa !== 'undefined') _uxa.push(['trackEvent', {name: 'Selenium Script Session', properties: {"
        "'script_name': 'csStoreJourneyZoningFunnel',"
        "'path': '" + str(selectedPath) + "',"
        "'path_name': '" + selectedPathName + "'"
        "}}]);"
    )
    log("MAIN", "_uxa trackEvent fired: 'Selenium Script Session' — script_name=csStoreJourneyZoningFunnel, path=" + str(selectedPath) + ", path_name=" + selectedPathName)

    if selectedPath == 1:
        path_happy_purchase()
    elif selectedPath == 2:
        path_wishlist_bounce()
    elif selectedPath == 3:
        path_search_browse()
    elif selectedPath == 4:
        path_cart_abandonment()
    elif selectedPath == 5:
        path_frustrated()
    elif selectedPath == 6:
        path_homepage_rage_bounce()
    elif selectedPath == 7:
        path_checkout_card_abandonment()

except Exception as e:
    log("ERROR", "Unhandled exception in path " + str(selectedPath) + " (" + selectedPathName + "): " + str(e))
    import traceback
    traceback.print_exc()

finally:
    log("CLEANUP", "Clearing storage and closing browser")
    try:
        driver.execute_script("window.localStorage.clear(); window.sessionStorage.clear();")
        log("CLEANUP", "localStorage and sessionStorage cleared")
    except Exception:
        pass
    try:
        driver.delete_all_cookies()
        log("CLEANUP", "Cookies deleted")
    except Exception:
        log("CLEANUP", "Could not delete cookies — session already closed")
    driver.quit()
    log("CLEANUP", "Browser closed — script complete")
