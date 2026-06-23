import sys
import time
import json
import random
import datetime
from datetime import date
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.wait import WebDriverWait
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import Select

scriptRunTimestamp = datetime.datetime.now()
print("scriptRunTimestamp = " + str(scriptRunTimestamp))
print("scriptname = csstorePurchaseNew.py")

# ---------------------------------------------------------------------------
# Load persona data (same JSON file as old script)
# ---------------------------------------------------------------------------
with open(
    "/root/SeleniumScripts/csStoreSeleniumScripts/csStoreCustomerPersonas.json", "r"
) as f:
    customerData = json.load(f)

randomPersonaSelector = random.randint(0, len(customerData) - 1)
print("number of entries in customerData = " + str(len(customerData)))

customerName                  = customerData[randomPersonaSelector]["customerName"]
customerNameArray             = customerName.split()
customerFirstName             = customerNameArray[0]
customerLastName              = customerNameArray[1]
customerEmailOriginal         = customerData[randomPersonaSelector]["customerEmail"]
customerPassword              = customerData[randomPersonaSelector]["customerPassword"]
customerStreetAddress         = customerData[randomPersonaSelector]["customerStreetAddress"]
customerPostalCode            = str(customerData[randomPersonaSelector]["customerPostalCode"])
customerMobileNumber          = customerData[randomPersonaSelector]["customerMobileNumber"]
customerState                 = str(customerData[randomPersonaSelector]["customerState"])
customerCountry               = str(customerData[randomPersonaSelector]["customerCountry"])
customerCity                  = str(customerData[randomPersonaSelector]["customerCity"])
customerAccountName           = customerData[randomPersonaSelector]["customerAccountName"]
customerNumberOfPastPurchases = customerData[randomPersonaSelector]["customerNumberOfPastPurchases"]
customerLastPurchaseCategory  = customerData[randomPersonaSelector]["customerLastPurchaseCategory"]
customerLastPurchaseDate      = customerData[randomPersonaSelector]["customerLastPurchaseDate"]
customerLastRefundDate        = customerData[randomPersonaSelector]["customerLastRefundDate"]
customerTotalSpent            = customerData[randomPersonaSelector]["customerTotalSpent"]
customerSignedUpDate          = customerData[randomPersonaSelector]["customerSignedUpDate"]

# Build unique email so each run is a fresh user registration
customerEmailAppendId         = random.randint(1000000000000000, 9999999999999999)
customerEmailUsernameNoDomain = customerEmailOriginal.split("@")[0]
customerEmailDomain           = customerEmailOriginal.split("@")[1]
customerEmail = (
    customerEmailUsernameNoDomain
    + "+"
    + str(customerEmailAppendId)
    + "@"
    + customerEmailDomain
)
print("customerEmail = " + customerEmail)
print("customerName = " + customerName)
print("customerFirstName = " + customerFirstName)
print("customerLastName = " + customerLastName)

# ---------------------------------------------------------------------------
# Randomised behaviour flags  (mirrors old script logic)
# ---------------------------------------------------------------------------
todaysDateValue    = date.today()
weekdayValue       = todaysDateValue.isoweekday()
timeSinceEpochUtm  = time.time()
randomUTMSelector  = str(timeSinceEpochUtm)

# Category slugs that exist in the new CStore DB
categorySlugs = [
    "electronics", "phones", "laptops",
    "clothing", "mens", "womens",
    "home-kitchen", "sports-outdoors", "books",
]

# Search terms relevant to the new store's product catalogue
searchValuesList = [
    "iphone", "macbook", "samsung", "laptop", "yoga mat",
    "coffee maker", "dress", "sneakers", "cookware", "book",
]
selectedSearchValue = random.choice(searchValuesList)
print("selectedSearchValue = " + selectedSearchValue)

sortOptions = ["newest", "price_asc", "price_desc", "name"]

filterSortSelector          = random.randint(1, 4)   # 1=cat, 2=price, 3=sort, 4=none
selectedCategorySlug        = random.choice(categorySlugs)
selectedSortOption          = random.choice(sortOptions)
print("filterSortSelector = " + str(filterSortSelector) + " (1=cat,2=price,3=sort,4=none)")
print("selectedCategorySlug = " + selectedCategorySlug)
print("selectedSortOption = " + selectedSortOption)

heroSlideSelection          = random.randint(1, 3)
homeCatSelection            = random.choice(categorySlugs[:5])  # top-level cats only
marketingInteraction        = random.randint(1, 4)   # 1=heroCTA, 2=homeCat, 3=promoBanner, 4=saleNav
print("heroSlideSelection = " + str(heroSlideSelection))
print("marketingInteraction = " + str(marketingInteraction) + " (1=heroCTA,2=homeCat,3=promo,4=sale)")

doesUserProductSearch         = random.randint(1, 100)
doesUserFilterSort            = random.randint(1, 100)
doesUserProductSelect         = random.randint(1, 100)
doesUserAddToWishList         = random.randint(1, 100)
doesUserAddToCart             = random.randint(1, 100)
doesUserViewCart              = random.randint(1, 100)
doesUserEnterCouponCode       = random.randint(1, 100)
doesUserProceedToCheckout     = random.randint(1, 100)
doesUserPlaceOrder            = random.randint(1, 100)
doesUserRegisterAccount       = random.randint(1, 100)   # 1-60 = register before checkout
selectedTabOnPDP              = random.choice(["description", "description", "reviews"])
productImgIndex               = random.randint(0, 3)     # thumbnail index (0-based)
doesUserClickThumb            = random.randint(1, 100)

print("doesUserProductSearch = " + str(doesUserProductSearch))
print("doesUserFilterSort = " + str(doesUserFilterSort))
print("doesUserProductSelect = " + str(doesUserProductSelect))
print("doesUserAddToWishList = " + str(doesUserAddToWishList))
print("doesUserAddToCart = " + str(doesUserAddToCart))
print("doesUserViewCart = " + str(doesUserViewCart))
print("doesUserEnterCouponCode = " + str(doesUserEnterCouponCode))
print("doesUserProceedToCheckout = " + str(doesUserProceedToCheckout))
print("doesUserPlaceOrder = " + str(doesUserPlaceOrder))
print("doesUserRegisterAccount = " + str(doesUserRegisterAccount))
print("selectedTabOnPDP = " + selectedTabOnPDP)

# ---------------------------------------------------------------------------
# UTM-coded starting URL  (same logic, new domain)
# ---------------------------------------------------------------------------
siteDomain = "localhost:3000"

utmVariants = [
    "?sessionReplay=true&sessionReplayName=csstorePurchaseNew",
    "/?utm_source=EmailList1&utm_medium=email&utm_campaign=CartAbandon&utm_content=TryNewStyles&sessionReplay=true&sessionReplayName=csstorePurchaseNew",
    "/?utm_source=Facebook&utm_medium=display&utm_campaign=GlobalCampaign&utm_content=NewLineup&sessionReplay=true&sessionReplayName=csstorePurchaseNew",
    "/?utm_source=Twitter&utm_medium=display&utm_campaign=GlobalCampaign&utm_content=NewLineup&sessionReplay=true&sessionReplayName=csstorePurchaseNew",
    "/?utm_source=Blog&utm_medium=referral&utm_campaign=NewArticles&utm_content=LatestTech&sessionReplay=true&sessionReplayName=csstorePurchaseNew",
    "/?utm_source=Google&utm_medium=cpc&utm_campaign=SponsoredContent&utm_content=StylesThatNeverQuit&sessionReplay=true&sessionReplayName=csstorePurchaseNew",
    "/?utm_source=Affiliate&utm_medium=referral&utm_campaign=RetailForAll&utm_content=ContentSeries1&sessionReplay=true&sessionReplayName=csstorePurchaseNew",
]
lastDigit = randomUTMSelector[-1]
utmIndex  = int(lastDigit) % len(utmVariants)
startingUrl = "http://" + siteDomain + utmVariants[utmIndex]
print("startingUrl = " + startingUrl)

# ---------------------------------------------------------------------------
# Chrome setup
# ---------------------------------------------------------------------------
userAgentString = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36"

options = webdriver.ChromeOptions()
options.add_argument("--headless")
options.add_argument("--no-sandbox")
options.add_argument("--disable-dev-shm-usage")
options.add_argument("user-agent=" + userAgentString)
options.page_load_strategy = "eager"

driver = webdriver.Chrome(options=options)
driver.set_window_position(0, 0)
driver.set_window_size(1280, 1080)
print(driver.get_window_size())


# ---------------------------------------------------------------------------
# Helper: smooth scroll + hover + click via ID
# ---------------------------------------------------------------------------
def scroll_to(element):
    driver.execute_script("arguments[0].scrollIntoView({behavior:'smooth',block:'center'})", element)
    time.sleep(1)

def hover_click(element, wait_after=2):
    ActionChains(driver, duration=800).move_to_element(element).perform()
    time.sleep(1)
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


# ---------------------------------------------------------------------------
# Navigation helpers
# ---------------------------------------------------------------------------
def clickMainLogo():
    print("running clickMainLogo")
    driver.execute_script("window.scrollTo({top:0,behavior:'smooth'})")
    time.sleep(1)
    logo = find_clickable("main-logo")
    hover_click(logo, wait_after=5)
    print("clicked main-logo")

def clickNavSaleLink():
    print("running clickNavSaleLink")
    saleLink = find_clickable("nav-sale-link")
    hover_click(saleLink, wait_after=4)
    print("clicked nav-sale-link")

def clickNavSearchAndReturn():
    print("running clickNavSearchAndReturn")
    searchInput = find_clickable("search-input")
    hover_click(searchInput, wait_after=1)
    searchInput.clear()
    searchInput.send_keys(selectedSearchValue)
    time.sleep(1)
    searchInput.send_keys(Keys.ENTER)
    time.sleep(6)
    clickMainLogo()


# ---------------------------------------------------------------------------
# Homepage interactions
# ---------------------------------------------------------------------------
def marketingHomePageInteraction():
    print("running marketingHomePageInteraction, interaction=" + str(marketingInteraction))

    if marketingInteraction == 1:
        print("clicking hero CTA button, slide=" + str(heroSlideSelection))
        ctaId = "hero-slide-" + str(heroSlideSelection) + "-cta"
        cta = find_clickable(ctaId)
        scroll_to(cta)
        hover_click(cta, wait_after=5)
        clickMainLogo()

    elif marketingInteraction == 2:
        print("clicking home category tile, category=" + homeCatSelection)
        catId = "home-cat-" + homeCatSelection
        catTile = find_clickable(catId)
        scroll_to(catTile)
        hover_click(catTile, wait_after=5)
        clickMainLogo()

    elif marketingInteraction == 3:
        print("clicking promo banner")
        bannerId = "promo-banner-" + str(random.randint(1, 2)) + "-cta"
        banner = find_clickable(bannerId)
        scroll_to(banner)
        hover_click(banner, wait_after=5)
        clickMainLogo()

    elif marketingInteraction == 4:
        print("clicking sale nav link")
        clickNavSaleLink()
        clickMainLogo()


# ---------------------------------------------------------------------------
# Shop / catalogue interactions
# ---------------------------------------------------------------------------
def navigateToShop():
    print("navigating to shop with search: " + selectedSearchValue)
    searchInput = find_clickable("search-input")
    hover_click(searchInput, wait_after=1)
    searchInput.clear()
    searchInput.send_keys(selectedSearchValue)
    time.sleep(1)
    searchInput.send_keys(Keys.ENTER)
    time.sleep(8)


def productFilterOrSort():
    print("running productFilterOrSort, selector=" + str(filterSortSelector))

    if filterSortSelector == 1:
        print("filter by category: " + selectedCategorySlug)
        catFilterId = "filter-cat-" + selectedCategorySlug
        catLink = find_clickable(catFilterId)
        scroll_to(catLink)
        hover_click(catLink, wait_after=6)

    elif filterSortSelector == 2:
        print("filter by price range 20-200")
        minField = find("filter-min-price")
        scroll_to(minField)
        ActionChains(driver, duration=800).double_click(minField).perform()
        minField.send_keys("20")
        time.sleep(1)
        maxField = find("filter-max-price")
        ActionChains(driver, duration=800).double_click(maxField).perform()
        maxField.send_keys("200")
        time.sleep(1)
        applyBtn = find_clickable("filter-apply")
        hover_click(applyBtn, wait_after=6)

    elif filterSortSelector == 3:
        print("sort by: " + selectedSortOption)
        sortSelect = find("filter-sort")
        scroll_to(sortSelect)
        time.sleep(1)
        Select(sortSelect).select_by_value(selectedSortOption)
        time.sleep(1)
        applyBtn = find_clickable("filter-apply")
        hover_click(applyBtn, wait_after=6)

    else:
        print("no filter/sort applied this run")


def productSelect():
    print("running productSelect")
    grid = WebDriverWait(driver, 10).until(
        EC.presence_of_element_located((By.ID, "products-grid"))
    )
    # Collect all product card containers
    cards = driver.find_elements(By.CSS_SELECTOR, "#products-grid [id^='product-card-']")
    print("numberOfProductsOnPage = " + str(len(cards)))
    if not cards:
        print("no product cards found, returning")
        return False

    selectedCard = random.choice(cards)
    productId = selectedCard.get_attribute("id").replace("product-card-", "")
    print("selected product-card-" + productId)

    # Scroll to and click the product name link
    nameLinkId = "pc-name-link-" + productId
    nameLink = find_clickable(nameLinkId)
    scroll_to(nameLink)
    hover_click(nameLink, wait_after=5)

    # Click through product detail tabs
    if selectedTabOnPDP == "reviews":
        print("clicking reviews tab")
        reviewTab = find_clickable("tab-reviews")
        scroll_to(reviewTab)
        hover_click(reviewTab, wait_after=2)
    else:
        print("clicking description tab")
        descTab = find_clickable("tab-description")
        scroll_to(descTab)
        hover_click(descTab, wait_after=2)

    # Optionally click a thumbnail image
    if doesUserClickThumb in range(1, 71):
        thumbs = driver.find_elements(By.CSS_SELECTOR, "#pd-thumbnails img[id^='pd-thumb-']")
        if thumbs:
            thumbIdx = min(productImgIndex, len(thumbs) - 1)
            thumbId = "pd-thumb-" + str(thumbIdx)
            try:
                thumb = find("pd-thumb-" + str(thumbIdx))
                scroll_to(thumb)
                hover_click(thumb, wait_after=2)
                print("clicked thumbnail pd-thumb-" + str(thumbIdx))
            except Exception:
                print("thumbnail pd-thumb-" + str(thumbIdx) + " not found, skipping")

    driver.execute_script("window.scrollTo({top:0,behavior:'smooth'})")
    time.sleep(2)
    return True


def productAddToWishList():
    print("running productAddToWishList")
    wishlistBtn = find_clickable("pd-wishlist-btn")
    scroll_to(wishlistBtn)
    hover_click(wishlistBtn, wait_after=3)
    print("wishlist button clicked")


def productAddToCart():
    print("running productAddToCart")
    # Check stock status first
    try:
        stockEl = driver.find_element(By.ID, "pd-stock-status")
        if "Out of Stock" in stockEl.text:
            print("product is out of stock — simulating rage clicks on stock status")
            for _ in range(6):
                ActionChains(driver).move_to_element(stockEl).perform()
                stockEl.click()
                time.sleep(0.25)
            print("rage clicks complete, exiting script")
            driver.delete_all_cookies()
            driver.quit()
            sys.exit("Terminating: product out of stock")
    except Exception:
        pass

    addBtn = find_clickable("pd-add-to-cart")
    scroll_to(addBtn)
    hover_click(addBtn, wait_after=5)
    print("add-to-cart button clicked")


# ---------------------------------------------------------------------------
# Cart interactions
# ---------------------------------------------------------------------------
def viewCart():
    print("running viewCart")
    cartLink = find_clickable("nav-cart-link")
    hover_click(cartLink, wait_after=5)
    print("navigated to cart")


def cartInteractions():
    print("running cartInteractions")

    if doesUserEnterCouponCode in range(1, 31):
        print("entering coupon code on cart")
        couponField = find_clickable("couponCode")
        scroll_to(couponField)
        hover_click(couponField, wait_after=1)
        couponField.send_keys("SAVE10")
        time.sleep(1)
        applyBtn = find_clickable("coupon-apply-btn")
        hover_click(applyBtn, wait_after=3)
        print("coupon code applied")

    # Increase quantity of first item if cart has items
    items = driver.find_elements(By.CSS_SELECTOR, "tr[id^='cart-item-']")
    if items:
        firstItemId = items[0].get_attribute("id").replace("cart-item-", "")
        increaseId = "cart-qty-increase-" + firstItemId
        try:
            increaseBtn = find_clickable(increaseId)
            scroll_to(increaseBtn)
            hover_click(increaseBtn, wait_after=3)
            print("increased qty for cart-item-" + firstItemId)
        except Exception:
            print("qty increase button not found, skipping")


def proceedToCheckout():
    print("running proceedToCheckout")
    checkoutBtn = find_clickable("proceed-to-checkout")
    scroll_to(checkoutBtn)
    hover_click(checkoutBtn, wait_after=6)
    print("proceeded to checkout")


# ---------------------------------------------------------------------------
# Account registration (new users register before checking out)
# ---------------------------------------------------------------------------
def registerAccount():
    print("running registerAccount")
    driver.get("http://" + siteDomain + "/register")
    time.sleep(4)

    nameField = find_clickable("register-name")
    hover_click(nameField, wait_after=1)
    nameField.send_keys(customerFirstName + " " + customerLastName)
    time.sleep(1)

    emailField = find_clickable("register-email")
    hover_click(emailField, wait_after=1)
    emailField.send_keys(customerEmail)
    time.sleep(1)

    pwField = find_clickable("register-password")
    hover_click(pwField, wait_after=1)
    pwField.send_keys(customerPassword)
    time.sleep(1)

    pwConfirmField = find_clickable("register-password-confirm")
    hover_click(pwConfirmField, wait_after=1)
    pwConfirmField.send_keys(customerPassword)
    time.sleep(1)

    submitBtn = find_clickable("register-submit")
    hover_click(submitBtn, wait_after=6)
    print("account registration submitted for " + customerEmail)


# ---------------------------------------------------------------------------
# Checkout / place order
# ---------------------------------------------------------------------------
def placeOrder():
    print("running placeOrder")

    nameField = find_clickable("shipping-name")
    scroll_to(nameField)
    nameField.click()
    nameField.clear()
    nameField.send_keys(customerFirstName + " " + customerLastName)
    time.sleep(1)

    emailField = find("shipping-email")
    emailField.click()
    emailField.clear()
    emailField.send_keys(customerEmail)
    time.sleep(1)

    addressField = find("shipping-address")
    addressField.click()
    addressField.clear()
    addressField.send_keys(customerStreetAddress)
    time.sleep(1)

    cityField = find("shipping-city")
    cityField.click()
    cityField.clear()
    cityField.send_keys(customerCity)
    time.sleep(1)

    stateField = find("shipping-state")
    stateField.click()
    stateField.clear()
    stateField.send_keys(customerState[:2].upper())
    time.sleep(1)

    zipField = find("shipping-zip")
    zipField.click()
    zipField.clear()
    zipField.send_keys("12345")
    time.sleep(1)

    # Read order total from checkout summary for CS tracking
    try:
        totalEl = driver.find_element(By.ID, "checkout-total-amount")
        orderTotal = totalEl.text.replace("$", "").strip()
        print("orderTotal = " + orderTotal)
    except Exception:
        orderTotal = "0.00"
        print("could not read orderTotal")

    # CS Identify before placing order
    driver.execute_script(
        "if(typeof _uxa !== 'undefined') _uxa.push(['trackPageEvent','@user-identifier@" + customerEmail + "']);"
    )

    placeBtn = find_clickable("place-order-btn")
    scroll_to(placeBtn)
    hover_click(placeBtn, wait_after=15)
    print("place-order-btn clicked")


def verifyOrderConfirmation():
    print("verifying order confirmation page")
    try:
        WebDriverWait(driver, 15).until(
            EC.presence_of_element_located((By.ID, "order-confirmation-header"))
        )
        orderNum = driver.find_element(By.ID, "confirmation-order-number").text
        print("Order confirmed! order_number = " + orderNum)

        # CS custom variable for order placed
        driver.execute_script(
            "if(typeof _uxa !== 'undefined') _uxa.push(['setCustomVariable','Order Placed','true']);"
        )
        return True
    except Exception:
        print("order confirmation page not detected")
        return False


# ---------------------------------------------------------------------------
# CS tracking helpers
# ---------------------------------------------------------------------------
def csIdentify():
    driver.execute_script(
        "if(typeof _uxa !== 'undefined') _uxa.push(['trackPageEvent','@user-identifier@" + customerEmail + "']);"
    )
    print("CS Identify sent for " + customerEmail)

def csSetCustomVariable(key, value):
    driver.execute_script(
        "if(typeof _uxa !== 'undefined') _uxa.push(['setCustomVariable','" + key + "','" + str(value) + "']);"
    )
    print("CS custom variable set: " + key + " = " + str(value))


# ---------------------------------------------------------------------------
# MAIN PROGRAMME
# ---------------------------------------------------------------------------

# 1. Open starting URL with UTM codes
driver.get(startingUrl)
time.sleep(5)
print("Homepage loaded: " + startingUrl)

# 2. Check for CS _uxa library
try:
    WebDriverWait(driver, 15).until(
        lambda d: d.execute_script(
            "if(typeof _uxa=='object'){return true;}"
        )
    )
    print("_uxa CS Library Found")
except Exception:
    print("_uxa not found on homepage — CS may not be installed yet")

# 3. CS Identify on homepage
csIdentify()
csSetCustomVariable("numberOfPastPurchases", str(customerNumberOfPastPurchases))

# 4. Homepage marketing interactions
marketingHomePageInteraction()

# 5. Optionally register an account before shopping
if doesUserRegisterAccount in range(1, 61):
    registerAccount()
    # After registration, go back to homepage
    clickMainLogo()

# 6. Product search
if doesUserProductSearch in range(1, 97):
    navigateToShop()

    # 7. Filter or sort
    if doesUserFilterSort in range(1, 91):
        productFilterOrSort()

    # 8. Select a product
    if doesUserProductSelect in range(1, 85):
        productSelected = productSelect()

        if productSelected:
            # 9. Add to wishlist (requires being logged in; skips gracefully if not)
            if doesUserAddToWishList in range(1, 61):
                try:
                    productAddToWishList()
                except Exception as e:
                    print("wishlist not available (probably not logged in): " + str(e))

            # 10. Add to cart
            if doesUserAddToCart in range(1, 71):
                productAddToCart()

                # 11. View cart
                if doesUserViewCart in range(1, 71):
                    viewCart()
                    cartInteractions()

                    # 12. Proceed to checkout
                    if doesUserProceedToCheckout in range(1, 61):
                        proceedToCheckout()

                        # 13. Place order
                        if doesUserPlaceOrder in range(1, 71):
                            placeOrder()
                            confirmed = verifyOrderConfirmation()
                            if confirmed:
                                csIdentify()
                                csSetCustomVariable("orderPlaced", "true")
                                print("Order flow complete")

                                # Brief browse after purchase
                                time.sleep(3)
                                try:
                                    contShoppingBtn = find_clickable("confirmation-continue-shopping")
                                    hover_click(contShoppingBtn, wait_after=5)
                                    print("continued shopping after order")
                                except Exception:
                                    clickMainLogo()
                        else:
                            print("user did not place order this run")
                else:
                    print("user did not view cart this run")
            else:
                print("user did not add to cart this run")
        else:
            print("productSelect returned no product, skipping downstream steps")
    else:
        print("user did not select a product this run")
else:
    print("user did not search this run")

print("csstorePurchaseNew.py Complete")
driver.delete_all_cookies()
driver.quit()
