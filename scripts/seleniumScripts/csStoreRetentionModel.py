import sys
import os
import time
import json
import random
import datetime
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.wait import WebDriverWait
from selenium.webdriver.common.keys import Keys

# ===========================================================================
# csStoreRetentionModel.py
#
# A DEDICATED retention-simulation script — separate from
# csStoreJourneyZoningFunnel.py on purpose. Every session is a returning,
# identified loyalty customer who may place a repeat order, with the
# probability shaped by a per-tier decay curve so that CSQ / Heap (Product
# Analytics) Retention reports show a realistic, declining cohort:
#
#   Start event / Return event : 'RetentionOrderPlaced'  (order-to-order)
#                                'RetentionSession'       (session-to-session)
#   Group by                   : 'Loyalty Tier' (Silver / Gold / Platinum)
#
# All tracking is fired by JS injection into the page (heap.* / _uxa) — the
# unified CSQ tag loads Heap, so NO site changes are needed. Every event is
# tagged data_source=retention / script_name=csStoreRetentionModel so this
# data is cleanly separable from the general behavioral dataset.
#
# Decay is shaped by a small per-user state file (retentionDecay.json) that
# records each user's first-order date and order count. Delete that file to
# restart the retention simulation from a fresh cohort.
# ===========================================================================

# ---------------------------------------------------------------------------
# [CONFIG] Change siteDomain to match your deployed site (or localhost:3000).
# ---------------------------------------------------------------------------
siteDomain = "cstore-new.vercel.app"

SCRIPT_DIR   = os.path.dirname(os.path.abspath(__file__))
PERSONA_FILE = os.path.join(SCRIPT_DIR, "csStoreCustomerPersonas.json")
POOL_FILE    = os.path.join(SCRIPT_DIR, "retentionPool.json")
STATE_FILE   = os.path.join(SCRIPT_DIR, "retentionDecay.json")

# ---------------------------------------------------------------------------
# [CONFIG] Decay tuning.
#
# These are PER-SESSION probabilities (rolled every session a user visits),
# not weekly percentages. Because a user gets multiple sessions per week, the
# realized weekly retention curve is higher than these per-session values.
# Expect to TUNE these against observed output after ~1-2 weeks of real data.
#
#   base          — return-order probability near week 0
#   halflife_wks  — weeks for the return probability to halve (bigger = slower decay)
#
# Higher tiers retain longer (slower decay); lower tiers drop off fast.
# ---------------------------------------------------------------------------
FIRST_ORDER_PROB = 0.55          # chance a not-yet-converted user places their FIRST order
MIN_DAYS_BETWEEN_ORDERS = 2      # light cooldown so order counts stay realistic

TIER_CONFIG = {
    "Platinum": {"base": 0.14, "halflife_wks": 9},
    "Gold":     {"base": 0.10, "halflife_wks": 6},
    "Silver":   {"base": 0.045, "halflife_wks": 3},
}

scriptRunTimestamp = datetime.datetime.now()
today = datetime.date.today()

print("[INIT] " + "=" * 60)
print("[INIT] scriptRunTimestamp = " + str(scriptRunTimestamp))
print("[INIT] scriptname = csStoreRetentionModel.py")


# ---------------------------------------------------------------------------
# [INIT] Load persona library + retention pool manifest
# ---------------------------------------------------------------------------
with open(PERSONA_FILE, "r") as f:
    personas = json.load(f)

if not os.path.exists(POOL_FILE):
    print("[INIT] ERROR — retentionPool.json not found. Run `npm run seed-retention-users` first.")
    sys.exit(1)

with open(POOL_FILE, "r") as f:
    retentionPool = json.load(f)

print("[INIT] retention pool size = " + str(len(retentionPool)))

# Pick a random loyalty customer for this session.
poolEntry   = random.choice(retentionPool)
persona     = personas[poolEntry["personaIndex"]]
loyaltyTier = poolEntry["tier"]

customerName          = persona["customerName"]
nameParts             = customerName.split()
customerFirstName     = nameParts[0]
customerLastName      = nameParts[1] if len(nameParts) > 1 else ""
customerEmail         = persona["customerEmail"].lower().strip()   # matches seeded DB record
customerPassword      = persona["customerPassword"]
customerStreetAddress = persona.get("customerStreetAddress", "")
customerCity          = str(persona.get("customerCity", ""))
customerState         = str(persona.get("customerState", ""))
customerPostalCode    = str(persona.get("customerPostalCode", ""))

print("[INIT] customer         = " + customerName + " <" + customerEmail + ">")
print("[INIT] loyaltyTier      = " + loyaltyTier)

searchTerms = ["nike", "adidas", "vans", "converse", "puma", "running", "basketball", "air max", "chuck", "old skool"]
selectedSearchValue = random.choice(searchTerms)

startingUrl = "https://" + siteDomain + "/?sessionReplay=true&sessionReplayName=csStoreRetentionModel"


# ---------------------------------------------------------------------------
# [STATE] Load / save the decay state file (atomic writes, script-relative)
# ---------------------------------------------------------------------------
def load_state():
    if not os.path.exists(STATE_FILE):
        return {}
    try:
        with open(STATE_FILE, "r") as f:
            return json.load(f)
    except Exception as e:
        print("[STATE] Could not read state file (" + str(e) + ") — starting empty")
        return {}

def save_state(state):
    # Atomic write: temp file + os.replace so the file is never left half-written.
    tmp = STATE_FILE + ".tmp"
    with open(tmp, "w") as f:
        json.dump(state, f, indent=2)
    os.replace(tmp, STATE_FILE)


# ---------------------------------------------------------------------------
# [DECAY] Return-order probability shaped by weeks since first order
# ---------------------------------------------------------------------------
def weeks_since(date_str):
    d = datetime.date.fromisoformat(date_str)
    return max(0.0, (today - d).days / 7.0)

def return_probability(tier, weeks):
    cfg = TIER_CONFIG[tier]
    decay = 0.5 ** (weeks / cfg["halflife_wks"])
    return cfg["base"] * decay

def days_since(date_str):
    d = datetime.date.fromisoformat(date_str)
    return (today - d).days


# ---------------------------------------------------------------------------
# [BROWSER] Chrome setup
# ---------------------------------------------------------------------------
print("[BROWSER] Initialising Chrome...")
userAgentString = "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6_7) AppleWebKit/605.1.15 (KHT...)"

options = webdriver.ChromeOptions()
options.add_argument("--headless=new")
options.add_argument("--no-sandbox")
options.add_argument("--disable-dev-shm-usage")
options.add_argument("--disable-gpu")
options.add_argument("--window-size=1280,900")
options.add_argument("user-agent=" + userAgentString)
options.page_load_strategy = "normal"

driver = webdriver.Chrome(options=options)
driver.set_window_size(1280, 900)
print("[BROWSER] Chrome launched")

driver.execute_cdp_cmd("Network.clearBrowserCookies", {})
driver.execute_cdp_cmd("Network.clearBrowserCache", {})
driver.execute_cdp_cmd("Network.enable", {})
# Returning loyalty customers arrive direct (typed / bookmarked / "we miss you" email).
driver.execute_cdp_cmd("Network.setExtraHTTPHeaders", {"headers": {"Referer": "https://mail.google.com/"}})


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

def partial_page_scroll(stop_fraction=0.5, label=""):
    ph = driver.execute_script("return document.body.scrollHeight")
    target = int(ph * stop_fraction)
    pos, step = 0, random.randint(280, 420)
    if label:
        log("SCROLL", label)
    while pos < target:
        pos += step
        driver.execute_script("window.scrollBy({top:" + str(step) + ",behavior:'smooth'})")
        time.sleep(random.uniform(0.4, 0.9))

def hover_click(element, wait_after=2.0):
    try:
        if element.size["width"] == 0 or element.size["height"] == 0:
            return
    except Exception as _e:
        if "invalid session id" in str(_e).lower():
            raise
        return
    ActionChains(driver, duration=random.randint(500, 900)).move_to_element(element).perform()
    time.sleep(random.uniform(0.3, 0.7))
    element.click()
    time.sleep(wait_after)

def find_clickable(element_id, timeout=10):
    return WebDriverWait(driver, timeout).until(EC.element_to_be_clickable((By.ID, element_id)))

def try_find(element_id, timeout=5):
    try:
        return WebDriverWait(driver, timeout).until(EC.presence_of_element_located((By.ID, element_id)))
    except Exception:
        return None


# ---------------------------------------------------------------------------
# CS + Heap tracking helpers (JS injection — unified CSQ tag loads Heap)
# ---------------------------------------------------------------------------
def cs_check():
    try:
        WebDriverWait(driver, 12).until(
            lambda d: d.execute_script("return (typeof _uxa==='object' && typeof heap==='object');")
        )
        log("TRACK", "_uxa + heap confirmed present")
    except Exception:
        log("TRACK", "tracking libs not found — events may not register")

def cs_identify():
    driver.execute_script(
        "if(typeof _uxa!=='undefined') _uxa.push(['trackPageEvent','@user-identifier@" + customerEmail + "']);"
    )

def cs_var(key, value):
    driver.execute_script(
        "if(typeof _uxa!=='undefined') _uxa.push(['setCustomVariable','" + key + "','" + str(value) + "']);"
    )

def heap_identify():
    driver.execute_script("if(typeof heap!=='undefined') heap.identify('" + customerEmail + "');")
    log("TRACK", "heap.identify + CS identify → " + customerEmail)

def heap_user_props():
    # Loyalty Tier is a USER property so the Retention report can group by it.
    driver.execute_script(
        "if(typeof heap!=='undefined') heap.addUserProperties({"
        "'Loyalty Tier':'" + loyaltyTier + "',"
        "'customerType':'returning'"
        "});"
    )

def heap_event_props():
    # data_source is set once and auto-attaches to every event this session.
    driver.execute_script(
        "if(typeof heap!=='undefined') heap.addEventProperties({"
        "'data_source':'retention',"
        "'script_name':'csStoreRetentionModel'"
        "});"
    )

def heap_track(event_name, props=None):
    props_json = json.dumps(props or {})
    driver.execute_script(
        "if(typeof heap!=='undefined') heap.track('" + event_name + "', " + props_json + ");"
    )
    log("TRACK", "heap event: '" + event_name + "' " + props_json)

def cs_event(name):
    driver.execute_script(
        "if(typeof _uxa!=='undefined') _uxa.push(['trackPageEvent','" + name + "']);"
    )


# ---------------------------------------------------------------------------
# Session flow helpers
# ---------------------------------------------------------------------------
def load_homepage():
    driver.get(startingUrl)
    time.sleep(random.uniform(4, 6))
    log("MAIN", "Homepage loaded — " + driver.current_url)
    cs_check()

def login_account():
    log("MAIN", "Logging in as " + customerEmail)
    driver.get("https://" + siteDomain + "/login")
    time.sleep(random.uniform(3, 5))
    email_field = find_clickable("login-email")
    hover_click(email_field, wait_after=0.5)
    email_field.send_keys(customerEmail)
    wait(0.5, 1.0)
    pw_field = find_clickable("login-password")
    hover_click(pw_field, wait_after=0.5)
    pw_field.send_keys(customerPassword)
    wait(0.6, 1.2)
    submit = find_clickable("login-submit")
    hover_click(submit, wait_after=random.uniform(4, 6))
    log("MAIN", "Login submitted")

def navigate_to_shop():
    if random.random() < 0.5:
        log("MAIN", "Shop via search: " + selectedSearchValue)
        try:
            search_input = find_clickable("search-input")
            hover_click(search_input, wait_after=0.5)
            search_input.clear()
            search_input.send_keys(selectedSearchValue)
            time.sleep(random.uniform(0.8, 1.5))
            search_input.send_keys(Keys.ENTER)
            time.sleep(random.uniform(5, 8))
            return
        except Exception:
            pass
    log("MAIN", "Shop via all products")
    driver.get("https://" + siteDomain + "/shop")
    time.sleep(random.uniform(6, 9))

def select_product():
    grid = try_find("products-grid", timeout=15)
    if not grid:
        log("MAIN", "products-grid not found")
        return None
    cards = driver.find_elements(By.CSS_SELECTOR, "#products-grid [id^='product-card-']")
    log("MAIN", "numberOfProductsOnPage = " + str(len(cards)))
    if not cards:
        return None
    selected = random.choice(cards)
    product_id = selected.get_attribute("id").replace("product-card-", "")
    name_link = try_find("pc-name-link-" + product_id, timeout=5)
    if not name_link:
        return None
    scroll_to(name_link)
    hover_click(name_link, wait_after=random.uniform(4, 6))
    log("MAIN", "On product detail page (product " + product_id + ")")
    return product_id

def add_to_cart():
    try:
        stock_el = driver.find_element(By.ID, "pd-stock-status")
        if "Out of Stock" in stock_el.text:
            log("MAIN", "Product out of stock — cannot order")
            return False
    except Exception:
        pass
    atc = try_find("pd-add-to-cart", timeout=15)
    if not atc:
        log("MAIN", "pd-add-to-cart not found")
        return False
    scroll_to(atc)
    hover_click(atc, wait_after=random.uniform(3, 5))
    log("MAIN", "Added to cart")
    return True

def view_cart():
    link = find_clickable("nav-cart-link")
    hover_click(link, wait_after=random.uniform(3, 5))
    log("MAIN", "Viewing cart")

def proceed_to_checkout():
    btn = find_clickable("proceed-to-checkout")
    scroll_to(btn)
    hover_click(btn, wait_after=random.uniform(5, 7))
    log("MAIN", "Proceeded to checkout")

def fill_checkout_form():
    def fill(field_id, value):
        el = try_find(field_id, timeout=8)
        if not el:
            return
        scroll_to(el)
        ActionChains(driver, duration=500).move_to_element(el).perform()
        el.click()
        el.clear()
        el.send_keys(value)
        wait(0.3, 0.8)
    fill("shipping-name", customerFirstName + " " + customerLastName)
    fill("shipping-email", customerEmail)
    fill("shipping-address", customerStreetAddress)
    fill("shipping-city", customerCity)
    fill("shipping-state", customerState[:2].upper())
    fill("shipping-zip", customerPostalCode[:5])
    log("MAIN", "Checkout form filled")

def fill_card_fields():
    try:
        pm_card = find_clickable("pm_card", timeout=6)
        scroll_to(pm_card)
        hover_click(pm_card, wait_after=random.uniform(1.0, 1.8))
    except Exception as ex:
        log("MAIN", "pm_card not found: " + str(ex))
        return
    cc_name = try_find("cc-name", timeout=6)
    if cc_name:
        scroll_to(cc_name)
        cc_name.click()
        cc_name.send_keys(customerFirstName + " " + customerLastName)
        wait(0.4, 0.9)
    cc_expiry = try_find("cc-expiry", timeout=5)
    if cc_expiry:
        cc_expiry.click()
        cc_expiry.send_keys(str(random.randint(1, 12)).zfill(2) + str(random.randint(27, 31)))
        wait(0.4, 0.9)
    cc_number = try_find("cc-number", timeout=5)
    if cc_number:
        cc_number.click()
        full = "4532" + str(random.randint(100000000000, 999999999999))
        cc_number.send_keys(full)
        wait(0.4, 0.8)
    cc_cvv = try_find("cc-cvv", timeout=5)
    if cc_cvv:
        cc_cvv.click()
        cc_cvv.send_keys(str(random.randint(100, 999)))
        wait(0.4, 0.8)
    log("MAIN", "Card fields filled")

def place_order():
    btn = find_clickable("place-order-btn")
    scroll_to(btn)
    hover_click(btn, wait_after=random.uniform(10, 15))
    log("MAIN", "place-order-btn clicked")

def verify_order_confirmation():
    try:
        WebDriverWait(driver, 15).until(
            EC.presence_of_element_located((By.ID, "order-confirmation-header"))
        )
        log("MAIN", "Order confirmed")
        return True
    except Exception:
        log("MAIN", "Order confirmation not detected")
        return False

def run_purchase_flow():
    """Full purchase for a returning loyalty customer. Returns True if order confirmed."""
    navigate_to_shop()
    pid = select_product()
    if not pid:
        return False
    partial_page_scroll(0.5, "reading PDP")
    if not add_to_cart():
        return False
    view_cart()
    partial_page_scroll(0.5, "reviewing cart")
    proceed_to_checkout()
    fill_checkout_form()
    fill_card_fields()
    place_order()
    return verify_order_confirmation()

def run_browse_only():
    """Returning customer visits but does not order this session."""
    navigate_to_shop()
    pid = select_product()
    if pid:
        partial_page_scroll(random.uniform(0.4, 0.7), "browsing without ordering")
        time.sleep(random.uniform(3, 6))
    log("MAIN", "Returning visit — no order this session")


# ===========================================================================
# [MAIN]
# ===========================================================================
state = load_state()
userState = state.get(customerEmail)

try:
    load_homepage()

    # Identity + segmentation — fired on EVERY session
    heap_identify()
    cs_identify()
    heap_user_props()
    heap_event_props()
    cs_var("script_name", "csStoreRetentionModel")
    cs_var("data_source", "retention")
    cs_var("Loyalty Tier", loyaltyTier)
    cs_var("customerType", "returning")

    login_account()

    # RetentionSession — fires every session (session-to-session retention)
    heap_track("RetentionSession", {"Loyalty Tier": loyaltyTier})
    cs_event("RetentionSession")

    # ---- Decide whether this session places an order ----
    place = False
    reason = ""

    if userState is None or not userState.get("firstOrderDate"):
        # Not yet in the cohort — chance to place their FIRST order
        if random.random() < FIRST_ORDER_PROB:
            place = True
            reason = "first order (entering cohort)"
    else:
        # Returning cohort member — decay-shaped probability, with cooldown
        cooldown_ok = True
        if userState.get("lastOrderDate"):
            cooldown_ok = days_since(userState["lastOrderDate"]) >= MIN_DAYS_BETWEEN_ORDERS
        weeks = weeks_since(userState["firstOrderDate"])
        p = return_probability(loyaltyTier, weeks)
        log("MAIN", "weeks since first order = " + str(round(weeks, 1)) +
            ", return P = " + str(round(p, 3)) + ", cooldown_ok = " + str(cooldown_ok))
        if cooldown_ok and random.random() < p:
            place = True
            reason = "return order (week " + str(round(weeks, 1)) + ")"

    if place:
        log("MAIN", "Order decision: PLACE — " + reason)
        confirmed = run_purchase_flow()
        if confirmed:
            # Fire the dedicated retention order event (isolated from general script)
            new_count = (userState.get("orderCount", 0) if userState else 0) + 1
            heap_track("RetentionOrderPlaced", {"Loyalty Tier": loyaltyTier, "orderNumber": new_count})
            cs_event("RetentionOrderPlaced")
            cs_var("orderNumber", new_count)

            # Update decay state
            if userState is None:
                userState = {"tier": loyaltyTier, "orderCount": 0}
            if not userState.get("firstOrderDate"):
                userState["firstOrderDate"] = today.isoformat()
            userState["orderCount"] = new_count
            userState["lastOrderDate"] = today.isoformat()
            userState["tier"] = loyaltyTier
            state[customerEmail] = userState
            save_state(state)
            log("MAIN", "State updated — orderCount = " + str(new_count))
        else:
            log("MAIN", "Order not confirmed — state unchanged")
    else:
        log("MAIN", "Order decision: NO ORDER this session")
        run_browse_only()

    log("MAIN", "Retention session complete for " + loyaltyTier + " customer " + customerEmail)

except Exception as e:
    log("ERROR", "Unhandled exception (" + loyaltyTier + " / " + customerEmail + "): " + str(e))
    import traceback
    traceback.print_exc()

finally:
    log("CLEANUP", "Closing browser")
    try:
        driver.execute_script("window.localStorage.clear(); window.sessionStorage.clear();")
    except Exception:
        pass
    try:
        driver.delete_all_cookies()
    except Exception:
        pass
    driver.quit()
    log("CLEANUP", "Done")
