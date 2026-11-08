include $(TOPDIR)/rules.mk

LUCI_TITLE:=LuCI support for Caddy 2
LUCI_DEPENDS:=+luci-base +caddy +rpcd +jshn +jsonfilter
LUCI_PKGARCH:=all
PKG_LICENSE:=Apache-2.0
PKG_VERSION:=1.1.0
PKG_RELEASE:=1

define Package/luci-app-caddy/conffiles
/etc/caddy-luci/
endef

include $(TOPDIR)/feeds/luci/luci.mk
