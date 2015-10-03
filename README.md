# CloudFlare API v4

This is a work in progress, but i do actively intend on creating a 100% complete api wrapper for v4

# TODO LIST

At the moment I can only flesh out the free endpoints, I have marked all the paid ones wish a ~~strikethrough~~.



## [User](#user)
- [x] [User details](#user-user-details)
- [x] [Update user](#user-update-user)

## [User Billing Profile](#user-billing-profile)
- [ ] [Billing Profile](#user-billing-profile-billing-profile)
- [ ] [Create billing profile](#user-billing-profile-create-billing-profile)
- [ ] [Update billing profile](#user-billing-profile-update-billing-profile)
- [ ] [Update particular elements of your billing profile](#user-billing-profile-update-particular-elements-of-your-billing-profile)
- [ ] [Delete billing profile](#user-billing-profile-delete-billing-profile)

## [User Billing History](#user-billing-history)
- [ ] [Billing history](#user-billing-history-billing-history)

## [App Subscription](#app-subscription)
- [ ] [List](#app-subscription-list)
- [ ] [Search, sort, and paginate](#app-subscription-search-sort-and-paginate)
- [ ] [Info](#app-subscription-info)

## [Zone Subscription](#zone-subscription)
- [ ] [List](#zone-subscription-list)
- [ ] [Search, sort, and paginate](#zone-subscription-search-sort-and-paginate)
- [ ] [Info](#zone-subscription-info)

## [User-level Firewall access rule](#user-level-firewall-access-rule)
- [ ] [List access rules](#user-level-firewall-access-rule-list-access-rules)
- [ ] [Create access rule](#user-level-firewall-access-rule-create-access-rule)
- [ ] [Update access rule](#user-level-firewall-access-rule-update-access-rule)
- [ ] [Delete access rule](#user-level-firewall-access-rule-delete-access-rule)

## [User&#x27;s Organizations](#user-s-organizations)
- [ ] [List organizations](#user-s-organizations-list-organizations)
- [ ] [Organization details](#user-s-organizations-organization-details)
- [ ] [Leave organization](#user-s-organizations-leave-organization)

## [User&#x27;s Invites](#user-s-invites)
- [ ] [List invitations](#user-s-invites-list-invitations)
- [ ] [Invitation details](#user-s-invites-invitation-details)
- [ ] [Respond to Invitation](#user-s-invites-respond-to-invitation)

## [Zone](#zone)
- [ ] [Create a zone](#zone-create-a-zone)
- [ ] [Initiate another zone activation check](#zone-initiate-another-zone-activation-check)
- [ ] [List zones](#zone-list-zones)
- [ ] [Zone details](#zone-zone-details)
- [ ] [Edit Zone Properties](#zone-edit-zone-properties)
- [ ] [Purge all files](#zone-purge-all-files)
- [ ] [Purge individual files by URL and Cache-Tags](#zone-purge-individual-files-by-url-and-cache-tags)
- [ ] [Delete a zone](#zone-delete-a-zone)

## [Zone Plan](#zone-plan)
- [ ] [Available plans](#zone-plan-available-plans)
- [ ] [Plan details](#zone-plan-plan-details)

## [Zone Settings](#zone-settings)
- [ ] [Get all Zone settings](#zone-settings-get-all-zone-settings)
----	~~[Get Advanced DDOS setting](#zone-settings-get-advanced-ddos-setting)~~
- [ ] [Get Always Online setting](#zone-settings-get-always-online-setting)
- [ ] [Get Browser Cache TTL setting](#zone-settings-get-browser-cache-ttl-setting)
- [ ] [Get Browser Check setting](#zone-settings-get-browser-check-setting)
- [ ] [Get Cache Level setting](#zone-settings-get-cache-level-setting)
- [ ] [Get Challenge TTL setting](#zone-settings-get-challenge-ttl-setting)
- [ ] [Get Development Mode setting](#zone-settings-get-development-mode-setting)
- [ ] [Get Email Obfuscation setting](#zone-settings-get-email-obfuscation-setting)
- [ ] [Get Hotlink Protection setting](#zone-settings-get-hotlink-protection-setting)
- [ ] [Get IP Geolocation setting](#zone-settings-get-ip-geolocation-setting)
- [ ] [Get IPv6 setting](#zone-settings-get-ipv6-setting)
- [ ] [Get Minify setting](#zone-settings-get-minify-setting)
- [ ] [Get Mobile Redirect setting](#zone-settings-get-mobile-redirect-setting)
- [ ] [Get Mirage setting](#zone-settings-get-mirage-setting)
----	~~[Get Enable Error Pages On setting](#zone-settings-get-enable-error-pages-on-setting)~~
- [ ] [Get Polish setting](#zone-settings-get-polish-setting)
----	~~[Get Prefetch Preload setting](#zone-settings-get-prefetch-preload-setting)~~
----	~~[Get Response Buffering setting](#zone-settings-get-response-buffering-setting)~~
- [ ] [Get Rocket Loader setting](#zone-settings-get-rocket-loader-setting)
- [ ] [Get Security Header (HSTS) setting](#zone-settings-get-security-header-hsts-setting)
- [ ] [Get Security Level setting](#zone-settings-get-security-level-setting)
- [ ] [Get Server Side Exclude setting](#zone-settings-get-server-side-exclude-setting)
----	~~[Get Enable Query String Sort setting](#zone-settings-get-enable-query-string-sort-setting)~~
- [ ] [Get SSL setting](#zone-settings-get-ssl-setting)
----	~~[Get Zone Enable TLS 1.2 setting](#zone-settings-get-zone-enable-tls-1-2-setting)~~
- [ ] [Get TLS Client Auth setting](#zone-settings-get-tls-client-auth-setting)
----	~~[Get True Client IP setting](#zone-settings-get-true-client-ip-setting)~~
----	~~[Get Web Application Firewall (WAF) setting](#zone-settings-get-web-application-firewall-waf-setting)~~
- [ ] [Edit zone settings info](#zone-settings-edit-zone-settings-info)
- [ ] [Change Always Online setting](#zone-settings-change-always-online-setting)
- [ ] [Change Browser Cache TTL setting](#zone-settings-change-browser-cache-ttl-setting)
- [ ] [Change Browser Check setting](#zone-settings-change-browser-check-setting)
- [ ] [Change Cache Level setting](#zone-settings-change-cache-level-setting)
- [ ] [Change Challenge TTL setting](#zone-settings-change-challenge-ttl-setting)
- [ ] [Change Development Mode setting](#zone-settings-change-development-mode-setting)
- [ ] [Change Email Obfuscation setting](#zone-settings-change-email-obfuscation-setting)
----	~~[Change Enable Error Pages On setting](#zone-settings-change-enable-error-pages-on-setting)~~
----	~~[Change Enable Query String Sort setting](#zone-settings-change-enable-query-string-sort-setting)~~
- [ ] [Change Hotlink Protection setting](#zone-settings-change-hotlink-protection-setting)
- [ ] [Change IP Geolocation setting](#zone-settings-change-ip-geolocation-setting)
- [ ] [Change IPv6 setting](#zone-settings-change-ipv6-setting)
- [ ] [Change Minify setting](#zone-settings-change-minify-setting)
- [ ] [Change Mobile Redirect setting](#zone-settings-change-mobile-redirect-setting)
----	~~[Change Mirage setting](#zone-settings-change-mirage-setting)~~
----	~~[Change Polish setting](#zone-settings-change-polish-setting)~~
----	~~[Change Prefetch Preload setting](#zone-settings-change-prefetch-preload-setting)~~
----	~~[Change Response Buffering setting](#zone-settings-change-response-buffering-setting)~~
- [ ] [Change Rocket Loader setting](#zone-settings-change-rocket-loader-setting)
- [ ] [Change Security Header (HSTS) setting](#zone-settings-change-security-header-hsts-setting)
- [ ] [Change Security Level setting](#zone-settings-change-security-level-setting)
- [ ] [Change Server Side Exclude setting](#zone-settings-change-server-side-exclude-setting)
- [ ] [Change SSL setting](#zone-settings-change-ssl-setting)
- [ ] [Change TLS Client Auth setting](#zone-settings-change-tls-client-auth-setting)
----	~~[Change True Client IP setting](#zone-settings-change-true-client-ip-setting)~~
----	~~[Change TLS 1.2 setting](#zone-settings-change-tls-1-2-setting)~~
----	~~[Change Web Application Firewall (WAF) setting](#zone-settings-change-web-application-firewall-waf-setting)~~

## [DNS Records for a Zone](#dns-records-for-a-zone)
- [ ] [Create DNS record](#dns-records-for-a-zone-create-dns-record)
- [ ] [List DNS Records](#dns-records-for-a-zone-list-dns-records)
- [ ] [DNS record details](#dns-records-for-a-zone-dns-record-details)
- [ ] [Update DNS record](#dns-records-for-a-zone-update-dns-record)
- [ ] [Delete DNS record](#dns-records-for-a-zone-delete-dns-record)

## [Railgun connections for a Zone](#railgun-connections-for-a-zone)
----	~~[Get available Railguns](#railgun-connections-for-a-zone-get-available-railguns)~~
----	~~[Get Railgun details](#railgun-connections-for-a-zone-get-railgun-details)~~
----	~~[Test Railgun connection](#railgun-connections-for-a-zone-test-railgun-connection)~~
----	~~[Connect or disconnect a Railgun](#railgun-connections-for-a-zone-connect-or-disconnect-a-railgun)~~

## [Zone Analytics](#zone-analytics)
- [ ] [Dashboard](#zone-analytics-dashboard)
----	~~[Analytics by Co-locations](#zone-analytics-analytics-by-co-locations)~~

## [Railgun](#railgun)
----	~~[Create Railgun](#railgun-create-railgun)~~
----	~~[List Railguns](#railgun-list-railguns)~~
----	~~[Railgun details](#railgun-railgun-details)~~
----	~~[Get zones connected to a Railgun](#railgun-get-zones-connected-to-a-railgun)~~
----	~~[Enable or disable a Railgun](#railgun-enable-or-disable-a-railgun)~~
----	~~[Delete Railgun](#railgun-delete-railgun)~~

## [Custom Pages for a Zone](#custom-pages-for-a-zone)
----	~~[Available Custom Pages](#custom-pages-for-a-zone-available-custom-pages)~~
----	~~[Custom Page details](#custom-pages-for-a-zone-custom-page-details)~~
----	~~[Update Custom page URL](#custom-pages-for-a-zone-update-custom-page-url)~~

## [Custom SSL for a Zone](#custom-ssl-for-a-zone)
----	~~[Create SSL configuration](#custom-ssl-for-a-zone-create-ssl-configuration)~~
----	~~[List SSL configurations](#custom-ssl-for-a-zone-list-ssl-configurations)~~
----	~~[SSL configuration details](#custom-ssl-for-a-zone-ssl-configuration-details)~~
----	~~[Update SSL configuration](#custom-ssl-for-a-zone-update-ssl-configuration)~~
----	~~[Re-prioritize SSL certificates](#custom-ssl-for-a-zone-re-prioritize-ssl-certificates)~~
----	~~[Delete an SSL certificate](#custom-ssl-for-a-zone-delete-an-ssl-certificate)~~

## [Keyless SSL for a Zone](#keyless-ssl-for-a-zone)
----	~~[Create a Keyless SSL configuration](#keyless-ssl-for-a-zone-create-a-keyless-ssl-configuration)~~
----	~~[List Keyless SSL Configurations](#keyless-ssl-for-a-zone-list-keyless-ssl-configurations)~~
----	~~[Keyless SSL details](#keyless-ssl-for-a-zone-keyless-ssl-details)~~
----	~~[Update Keyless configuration](#keyless-ssl-for-a-zone-update-keyless-configuration)~~
----	~~[Delete Keyless configuration](#keyless-ssl-for-a-zone-delete-keyless-configuration)~~

## [Firewall access rule for a Zone](#firewall-access-rule-for-a-zone)
- [x] [List access rules](#firewall-access-rule-for-a-zone-list-access-rules)
- [x] [Create access rule](#firewall-access-rule-for-a-zone-create-access-rule)
- [x] [Update access rule](#firewall-access-rule-for-a-zone-update-access-rule)
- [x] [Delete access rule](#firewall-access-rule-for-a-zone-delete-access-rule)

## [WAF Rule Packages](#waf-rule-packages)
----	~~[List firewall packages](#waf-rule-packages-list-firewall-packages)~~
----	~~[Firewall package info](#waf-rule-packages-firewall-package-info)~~
----	~~[Change anomaly-detection web application firewall package settings](#waf-rule-packages-change-anomaly-detection-web-application-firewall-package-settings)~~

## [WAF Rule Groups](#waf-rule-groups)
----	~~[List rule groups](#waf-rule-groups-list-rule-groups)~~
----	~~[Rule group info](#waf-rule-groups-rule-group-info)~~
----	~~[Update Rule group](#waf-rule-groups-update-rule-group)~~

## [WAF Rules](#waf-rules)
----	~~[List rules](#waf-rules-list-rules)~~
----	~~[Rule info](#waf-rules-rule-info)~~
----	~~[Update rule](#waf-rules-update-rule)~~

## [Organizations](#organizations)
----	~~[Organization details](#organizations-organization-details)~~
----	~~[Update organization](#organizations-update-organization)~~

## [Organization Members](#organization-members)
----	~~[List members](#organization-members-list-members)~~
----	~~[Member details](#organization-members-member-details)~~
----	~~[Update member roles](#organization-members-update-member-roles)~~
----	~~[Remove member](#organization-members-remove-member)~~

## [Organization Invites](#organization-invites)
----	~~[Create invitation](#organization-invites-create-invitation)~~
----	~~[List invitations](#organization-invites-list-invitations)~~
----	~~[Invitation details](#organization-invites-invitation-details)~~
----	~~[Update invitation roles](#organization-invites-update-invitation-roles)~~
----	~~[Cancel Invitation](#organization-invites-cancel-invitation)~~

## [Organization Roles](#organization-roles)
----	~~[List roles](#organization-roles-list-roles)~~
----	~~[Role details](#organization-roles-role-details)~~

## [Organization-level Firewall access rule](#organization-level-firewall-access-rule)
----	~~[List access rules](#organization-level-firewall-access-rule-list-access-rules)~~
----	~~[Create access rule](#organization-level-firewall-access-rule-create-access-rule)~~
----	~~[Update access rule](#organization-level-firewall-access-rule-update-access-rule)~~
----	~~[Delete access rule](#organization-level-firewall-access-rule-delete-access-rule)~~