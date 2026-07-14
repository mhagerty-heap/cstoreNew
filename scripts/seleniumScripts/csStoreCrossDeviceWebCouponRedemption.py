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
# csStoreCrossDeviceWebCouponRedemption.py
#
# The second half of the cross-device story: a customer who returned an item
# in-store via the kiosk (csStoreCrossDeviceKiosk.py, identity captured via a
# direct network call to Heap's server-side API — no CSQ tag involved at all)
# comes back to the real website a few days later and redeems the coupon
# they were issued. This is deliberately its OWN script, independent of
# csStoreRetentionModel.py, so the cross-device narrative stays isolated
# from the general retention cohort simulation.
#
# Reads pendingInStoreCoupons.json (written by csStoreCrossDeviceKiosk.py),
# picks one persona whose coupon has been pending for at least
# MIN_DAYS_BEFORE_REDEMPTION days, logs in as them on the real site, and
# either just applies the coupon and abandons, or completes a full purchase
# with it — both are realistic outcomes for someone who was handed a coupon.
# On successful apply, fires an extra custom event (InStoreCouponRedeemedOnline,
# script_name=cross_device_kiosk) via the normal _uxa.push(...) path, on top
# of whatever ordinary tracking the real site already fires for this session.
# ===========================================================================

siteDomain = "cstore-new.vercel.app"

SCRIPT_DIR           = os.path.dirname(os.path.abspath(__file__))
PERSONA_FILE         = os.path.join(SCRIPT_DIR, "csStoreCustomerPersonas.json")
POOL_FILE            = os.path.join(SCRIPT_DIR, "retentionPool.json")
PENDING_COUPONS_FILE = os.path.join(SCRIPT_DIR, "pendingInStoreCoupons.json")

MIN_DAYS_BEFORE_REDEMPTION = 2      # coupon must have been issued at least this long ago
COMPLETE_PURCHASE_PROB     = 0.65   # otherwise: apply the coupon, then abandon

searchTerms = ["nike", "adidas", "vans", "converse", "puma", "air max", "chuck", "old skool"]
selectedSearchValue = random.choice(searchTerms)


def log(prefix, msg):
    print("[" + prefix + "] " + msg)


# ---------------------------------------------------------------------------
# [STATE] Pending in-store coupons, keyed by email — same file
# csStoreCrossDeviceKiosk.py writes to.
# ---------------------------------------------------------------------------
def load_pending_coupons():
    if not os.path.exists(PENDING_COUPONS_FILE):
        return {}
    try:
        with open(PENDING_COUPONS_FILE, "r") as f:
            return json.load(f)
    except Exception as e:
        log("STATE", "Could not read pending coupons file (" + str(e) + ") — starting empty")
        return {}

def save_pending_coupons(pending):
    tmp = PENDING_COUPONS_FILE + ".tmp"
    with open(tmp, "w") as f:
        json.dump(pending, f, indent=2)
    os.replace(tmp, PENDING_COUPONS_FILE)

def days_since(date_str):
    d = datetime.date.fromisoformat(date_str)
    return (datetime.date.today() - d).days


# ---------------------------------------------------------------------------
# [INIT] Pick an eligible pending coupon
# ---------------------------------------------------------------------------
with open(PERSONA_FILE, "r") as f:
    personas = json.load(f)
with open(POOL_FILE, "r") as f:
    retentionPool = json.load(f)

emailToPersona = {}
for entry in retentionPool:
    p = personas[entry["personaIndex"]]
    emailToPersona[p["customerEmail"].lower().strip()] = p

pending = load_pending_coupons()
eligible = [
    (email, info) for email, info in pending.items()
    if days_since(info["issuedAt"]) >= MIN_DAYS_BEFORE_REDEMPTION
]

log("INIT", "pending coupons total = " + str(len(pending)) + ", eligible for redemption = " + str(len(eligible)))

if not eligible:
    log("INIT", "No eligible pending coupons to redeem yet — exiting")
    raise SystemExit(0)

customerEmail, couponInfo = random.choice(eligible)
persona = emailToPersona.get(customerEmail)

if not persona:
    log("ERROR", "No persona found in pool for " + customerEmail + " — skipping")
    raise SystemExit(1)

couponCode = couponInfo["code"]
customerName = persona["customerName"]
nameParts = customerName.split()
customerFirstName = nameParts[0]
customerLastName = nameParts[1] if len(nameParts) > 1 else ""
customerPassword = persona["customerPassword"]
customerStreetAddress = persona.get("customerStreetAddress", "")
customerCity = str(persona.get("customerCity", ""))
customerState = str(persona.get("customerState", ""))
customerPostalCode = str(persona.get("customerPostalCode", ""))

daysWaited = days_since(couponInfo["issuedAt"])
willCompletePurchase = random.random() < COMPLETE_PURCHASE_PROB

log("INIT", "Redeeming " + couponCode + " for " + customerEmail + " (issued " + str(daysWaited) + " days ago)")
log("INIT", "Will complete purchase: " + str(willCompletePurchase))


# ---------------------------------------------------------------------------
# [BROWSER] Chrome setup
# ---------------------------------------------------------------------------
log("BROWSER", "Initialising Chrome...")
options = webdriver.ChromeOptions()
options.add_argument("--headless=new")
options.add_argument("--no-sandbox")
options.add_argument("--disable-dev-shm-usage")
options.add_argument("--disable-gpu")
options.add_argument("--window-size=1280,900")
options.page_load_strategy = "normal"

driver = webdriver.Chrome(options=options)
log("BROWSER", "Chrome launched")


# ---------------------------------------------------------------------------
# Utility helpers (self-contained, same pattern as the other Selenium scripts)
# ---------------------------------------------------------------------------
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

def cs_var(key, value):
    driver.execute_script(
        "if(typeof _uxa!=='undefined') _uxa.push(['setCustomVariable','" + key + "','" + str(value) + "']);"
    )


# ---------------------------------------------------------------------------
# Session flow helpers
# ---------------------------------------------------------------------------
def load_homepage():
    driver.get("https://" + siteDomain + "/?sessionReplay=true&sessionReplayName=csStoreCrossDeviceWebCouponRedemption")
    time.sleep(random.uniform(4, 6))
    log("MAIN", "Homepage loaded — " + driver.current_url)

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

def apply_coupon_redemption(code):
    """Applies the real in-store-issued coupon, then fires the extra
    isolation event on top of whatever ordinary tracking this page has.

    /coupon/apply self-heals INSTORE- codes it doesn't recognize (see
    routes/coupon.js), so this doesn't need to re-issue or retry itself —
    a single attempt is reliable regardless of which serverless instance
    handles it."""
    coupon_field = try_find("couponCode", timeout=5)
    if not coupon_field:
        log("MAIN", "couponCode field not found — cannot redeem")
        return False
    scroll_to(coupon_field)
    hover_click(coupon_field, wait_after=0.5)
    coupon_field.clear()
    coupon_field.send_keys(code)
    wait(0.8, 1.5)
    apply_btn = find_clickable("coupon-apply-btn")
    hover_click(apply_btn, wait_after=random.uniform(2, 3))

    try:
        WebDriverWait(driver, 6).until(EC.presence_of_element_located((By.ID, "cart-coupon-applied")))
    except Exception:
        log("MAIN", "Coupon apply did not confirm — treating as failed")
        return False

    log("MAIN", "In-store coupon redeemed on web: " + code)

    # Same properties as the trackEvent below, also set as CSQ dynamic
    # variables so this session is segmentable in CSQ the same way it's
    # segmentable in Heap (event properties alone don't surface at the
    # session/session-list level in CSQ).
    cs_var("script_name", "cross_device_kiosk")
    cs_var("channel", "web")
    cs_var("coupon_code", code)
    cs_var("days_since_issued", daysWaited)

    driver.execute_script(
        "if(typeof _uxa!=='undefined') _uxa.push(['trackEvent', {name: 'InStoreCouponRedeemedOnline', properties: {"
        "'channel': 'web',"
        "'script_name': 'cross_device_kiosk',"
        "'coupon_code': '" + code + "',"
        "'days_since_issued': " + str(daysWaited) +
        "}}]);"
    )
    return True

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
        WebDriverWait(driver, 15).until(EC.presence_of_element_located((By.ID, "order-confirmation-header")))
        log("MAIN", "Order confirmed")
        return True
    except Exception:
        log("MAIN", "Order confirmation not detected")
        return False


# ===========================================================================
# [MAIN]
# ===========================================================================
try:
    load_homepage()
    login_account()
    navigate_to_shop()

    pid = select_product()
    redeemed = False

    if pid and add_to_cart():
        partial_page_scroll(0.5, "reviewing product before cart")
        view_cart()
        partial_page_scroll(0.4, "reviewing cart")
        redeemed = apply_coupon_redemption(couponCode)

        if redeemed and willCompletePurchase:
            proceed_to_checkout()
            fill_checkout_form()
            fill_card_fields()
            place_order()
            confirmed = verify_order_confirmation()
            log("MAIN", "Outcome: coupon redeemed + purchase " + ("completed" if confirmed else "not confirmed"))
        elif redeemed:
            log("MAIN", "Outcome: coupon redeemed, then abandoned (no purchase)")
        else:
            log("MAIN", "Outcome: coupon redemption failed")
    else:
        log("MAIN", "Could not add a product to cart — coupon not redeemed this run")

    if redeemed:
        pending = load_pending_coupons()
        pending.pop(customerEmail, None)
        save_pending_coupons(pending)
        log("STATE", "Removed redeemed coupon from pending file for " + customerEmail)

    log("MAIN", "Cross-device redemption session complete for " + customerEmail)

except Exception as e:
    log("ERROR", "Unhandled exception (" + customerEmail + "): " + str(e))
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
