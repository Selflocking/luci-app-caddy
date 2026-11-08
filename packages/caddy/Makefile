include $(TOPDIR)/rules.mk

PKG_NAME:=caddy
PKG_VERSION:=2.11.9
PKG_RELEASE:=1
PKG_SOURCE:=$(PKG_NAME)-$(PKG_VERSION).tar.gz
PKG_SOURCE_URL:=https://codeload.github.com/caddyserver/caddy/tar.gz/v$(PKG_VERSION)?
PKG_HASH:=fefbe1f72b7a7e244f348c20eba377bb1e6964f51594229d2f38c49eaa2aa9a4
PKG_LICENSE:=Apache-2.0
PKG_LICENSE_FILES:=LICENSE
PKG_BUILD_DEPENDS:=golang/host
PKG_BUILD_PARALLEL:=1
PKG_BUILD_FLAGS:=no-mips16
GO_PKG:=github.com/caddyserver/caddy/v2
GO_PKG_BUILD_PKG:=$(GO_PKG)/cmd/caddy
GO_PKG_LDFLAGS:=-s -w
GO_PKG_LDFLAGS_X:=github.com/caddyserver/caddy/v2.CustomVersion=v$(PKG_VERSION)

include $(INCLUDE_DIR)/package.mk
include $(TOPDIR)/feeds/packages/lang/golang/golang-package.mk

define Package/caddy
  SECTION:=net
  CATEGORY:=Network
  SUBMENU:=Web Servers/Proxies
  TITLE:=Caddy 2 web server
  URL:=https://caddyserver.com
  DEPENDS:=$(GO_ARCH_DEPENDS) +ca-bundle
endef

define Package/caddy/install
	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_BIN) $(GO_PKG_BUILD_BIN_DIR)/caddy $(1)/usr/bin/caddy
endef

$(eval $(call GoBinPackage,caddy))
$(eval $(call BuildPackage,caddy))
