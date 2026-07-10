import os
import time
import json
import random
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import Select
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.wait import WebDriverWait

# ===========================================================================
# csStoreCrossDeviceKiosk.py
#
# Drives the /kiosk "in-store returns terminal" page — a standalone view with
# no CSQ tag, no nav, no footer. The page's own JS fires the identify+event
# call directly to Heap's server-side track API (no browser tag involved at
# all), which is the point: identity resolution from any network-enabled
# device, not just tagged web pages. This script has nothing to do with
# CSQ/Heap coordination itself — it just fills out the form like an
# associate would; the page handles its own tracking.
#
# Reuses the SAME 150-person retention pool as csStoreRetentionModel.py so
# the story is coherent: these are the same loyalty customers, occasionally
# returning items in-store rather than just browsing online. Each issued
# coupon is written to pendingInStoreCoupons.json, keyed by email, for
# csStoreRetentionModel.py's apply_coupon_cart() to pick up and redeem on
# that persona's next natural web visit.
#
# Isolated from the general dataset via script_name=cross_device_kiosk /
# channel=in_store_kiosk (set client-side, in views/kiosk.ejs).
# ===========================================================================

siteDomain = "cstore-new.vercel.app"

SCRIPT_DIR        = os.path.dirname(os.path.abspath(__file__))
PERSONA_FILE      = os.path.join(SCRIPT_DIR, "csStoreCustomerPersonas.json")
POOL_FILE         = os.path.join(SCRIPT_DIR, "retentionPool.json")
PENDING_COUPONS_FILE = os.path.join(SCRIPT_DIR, "pendingInStoreCoupons.json")

RETURN_REASONS = ["wrong_size", "changed_mind", "defective", "other"]
ITEM_DESCRIPTIONS = [
    "Nike Daybreak Type - Size 10",
    "Adidas Originals ZX 500 RM - Size 9",
    "Vans UA EVDNT UltimateWaffle - Size 8",
    "Puma Mirage Mox EB - Size 11",
    "Converse x Keith Haring Chuck 70 - Size 9.5",
]

# ---------------------------------------------------------------------------
# [INIT] Load persona library + retention pool manifest — same pool as
# csStoreRetentionModel.py.
# ---------------------------------------------------------------------------
with open(PERSONA_FILE, "r") as f:
    personas = json.load(f)

with open(POOL_FILE, "r") as f:
    retentionPool = json.load(f)

poolEntry   = random.choice(retentionPool)
persona     = personas[poolEntry["personaIndex"]]
customerEmail = persona["customerEmail"].lower().strip()

print("[INIT] " + "=" * 60)
print("[INIT] scriptname = csStoreCrossDeviceKiosk.py")
print("[INIT] customer    = " + persona["customerName"] + " <" + customerEmail + ">")

# ---------------------------------------------------------------------------
# [STATE] Pending in-store coupons, keyed by email. Atomic write, same
# pattern as the other state files.
# ---------------------------------------------------------------------------
def load_pending_coupons():
    if not os.path.exists(PENDING_COUPONS_FILE):
        return {}
    try:
        with open(PENDING_COUPONS_FILE, "r") as f:
            return json.load(f)
    except Exception as e:
        print("[STATE] Could not read pending coupons file (" + str(e) + ") — starting empty")
        return {}

def save_pending_coupons(pending):
    tmp = PENDING_COUPONS_FILE + ".tmp"
    with open(tmp, "w") as f:
        json.dump(pending, f, indent=2)
    os.replace(tmp, PENDING_COUPONS_FILE)

# ---------------------------------------------------------------------------
# [BROWSER] Chrome setup
# ---------------------------------------------------------------------------
print("[BROWSER] Initialising Chrome...")
options = webdriver.ChromeOptions()
options.add_argument("--headless=new")
options.add_argument("--no-sandbox")
options.add_argument("--disable-dev-shm-usage")
options.add_argument("--disable-gpu")
options.add_argument("--window-size=900,1000")
options.page_load_strategy = "normal"

driver = webdriver.Chrome(options=options)
print("[BROWSER] Chrome launched")


def log(prefix, msg):
    print("[" + prefix + "] " + msg)


try:
    kioskUrl = "https://" + siteDomain + "/kiosk"
    log("MAIN", "Loading kiosk terminal: " + kioskUrl)
    driver.get(kioskUrl)
    WebDriverWait(driver, 10).until(EC.presence_of_element_located((By.ID, "kiosk-return-form")))
    time.sleep(random.uniform(1.5, 3))

    item = random.choice(ITEM_DESCRIPTIONS)
    reason = random.choice(RETURN_REASONS)

    log("MAIN", "Processing return — item='" + item + "', reason=" + reason + ", email=" + customerEmail)

    item_input = driver.find_element(By.ID, "kiosk-item-input")
    item_input.send_keys(item)
    time.sleep(random.uniform(0.5, 1.0))

    reason_select = Select(driver.find_element(By.ID, "kiosk-reason-select"))
    reason_select.select_by_value(reason)
    time.sleep(random.uniform(0.4, 0.8))

    email_input = driver.find_element(By.ID, "kiosk-email-input")
    email_input.send_keys(customerEmail)
    time.sleep(random.uniform(0.5, 1.0))

    driver.find_element(By.ID, "kiosk-submit-btn").click()

    WebDriverWait(driver, 10).until(
        lambda d: d.execute_script("return document.getElementById('kiosk-success').style.display;") == "block"
    )
    couponCode = driver.execute_script("return document.getElementById('kiosk-success-code').textContent;")
    log("MAIN", "Return processed — coupon issued: " + couponCode)

    pending = load_pending_coupons()
    pending[customerEmail] = {
        "code": couponCode,
        "issuedAt": time.strftime("%Y-%m-%d"),
        "item": item,
        "reason": reason,
    }
    save_pending_coupons(pending)
    log("STATE", "Saved pending in-store coupon for " + customerEmail)

    log("MAIN", "Cross-device kiosk session complete for " + customerEmail)

except Exception as e:
    log("ERROR", "Unhandled exception (" + customerEmail + "): " + str(e))
    import traceback
    traceback.print_exc()

finally:
    log("CLEANUP", "Closing browser")
    driver.quit()
    log("CLEANUP", "Done")
