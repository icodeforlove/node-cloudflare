# CloudFlare API v4

This is a work in progress, but i do actively intend on creating a 100% complete api wrapper for v4

# TODO LIST

At the moment I can only flesh out the free endpoints, I have marked all the paid ones wish a ~~strikethrough~~.



## [User](https://api.cloudflare.com/#user)
- [x] [User details](https://api.cloudflare.com/#user-user-details)
- [x] [Update user](https://api.cloudflare.com/#user-update-user)

## [User Billing Profile](https://api.cloudflare.com/#user-billing-profile)
- [ ] [Billing Profile](https://api.cloudflare.com/#user-billing-profile-billing-profile)
- [ ] [Create billing profile](https://api.cloudflare.com/#user-billing-profile-create-billing-profile)
- [ ] [Update billing profile](https://api.cloudflare.com/#user-billing-profile-update-billing-profile)
- [ ] [Update particular elements of your billing profile](https://api.cloudflare.com/#user-billing-profile-update-particular-elements-of-your-billing-profile)
- [ ] [Delete billing profile](https://api.cloudflare.com/#user-billing-profile-delete-billing-profile)

## [User Billing History](https://api.cloudflare.com/#user-billing-history)
- [ ] [Billing history](https://api.cloudflare.com/#user-billing-history-billing-history)

## [App Subscription](https://api.cloudflare.com/#app-subscription)
- [ ] [List](https://api.cloudflare.com/#app-subscription-list)
- [ ] [Search, sort, and paginate](https://api.cloudflare.com/#app-subscription-search-sort-and-paginate)
- [ ] [Info](https://api.cloudflare.com/#app-subscription-info)

## [Zone Subscription](https://api.cloudflare.com/#zone-subscription)
- [ ] [List](https://api.cloudflare.com/#zone-subscription-list)
- [ ] [Search, sort, and paginate](https://api.cloudflare.com/#zone-subscription-search-sort-and-paginate)
- [ ] [Info](https://api.cloudflare.com/#zone-subscription-info)

## [User-level Firewall access rule](https://api.cloudflare.com/#user-level-firewall-access-rule)
- [ ] [List access rules](https://api.cloudflare.com/#user-level-firewall-access-rule-list-access-rules)
- [ ] [Create access rule](https://api.cloudflare.com/#user-level-firewall-access-rule-create-access-rule)
- [ ] [Update access rule](https://api.cloudflare.com/#user-level-firewall-access-rule-update-access-rule)
- [ ] [Delete access rule](https://api.cloudflare.com/#user-level-firewall-access-rule-delete-access-rule)

## [User&#x27;s Organizations](https://api.cloudflare.com/#user-s-organizations)
- [ ] [List organizations](https://api.cloudflare.com/#user-s-organizations-list-organizations)
- [ ] [Organization details](https://api.cloudflare.com/#user-s-organizations-organization-details)
- [ ] [Leave organization](https://api.cloudflare.com/#user-s-organizations-leave-organization)

## [User&#x27;s Invites](https://api.cloudflare.com/#user-s-invites)
- [ ] [List invitations](https://api.cloudflare.com/#user-s-invites-list-invitations)
- [ ] [Invitation details](https://api.cloudflare.com/#user-s-invites-invitation-details)
- [ ] [Respond to Invitation](https://api.cloudflare.com/#user-s-invites-respond-to-invitation)

## [Zone](https://api.cloudflare.com/#zone)
- [ ] [Create a zone](https://api.cloudflare.com/#zone-create-a-zone)
- [ ] [Initiate another zone activation check](https://api.cloudflare.com/#zone-initiate-another-zone-activation-check)
- [ ] [List zones](https://api.cloudflare.com/#zone-list-zones)
- [ ] [Zone details](https://api.cloudflare.com/#zone-zone-details)
- [ ] [Edit Zone Properties](https://api.cloudflare.com/#zone-edit-zone-properties)
- [ ] [Purge all files](https://api.cloudflare.com/#zone-purge-all-files)
- [ ] [Purge individual files by URL and Cache-Tags](https://api.cloudflare.com/#zone-purge-individual-files-by-url-and-cache-tags)
- [ ] [Delete a zone](https://api.cloudflare.com/#zone-delete-a-zone)

## [Zone Plan](https://api.cloudflare.com/#zone-plan)
- [ ] [Available plans](https://api.cloudflare.com/#zone-plan-available-plans)
- [ ] [Plan details](https://api.cloudflare.com/#zone-plan-plan-details)

## [Zone Settings](https://api.cloudflare.com/#zone-settings)
- [ ] [Get all Zone settings](https://api.cloudflare.com/#zone-settings-get-all-zone-settings)
- [ ]	~~[Get Advanced DDOS setting](https://api.cloudflare.com/#zone-settings-get-advanced-ddos-setting)~~
- [ ] [Get Always Online setting](https://api.cloudflare.com/#zone-settings-get-always-online-setting)
- [ ] [Get Browser Cache TTL setting](https://api.cloudflare.com/#zone-settings-get-browser-cache-ttl-setting)
- [ ] [Get Browser Check setting](https://api.cloudflare.com/#zone-settings-get-browser-check-setting)
- [ ] [Get Cache Level setting](https://api.cloudflare.com/#zone-settings-get-cache-level-setting)
- [ ] [Get Challenge TTL setting](https://api.cloudflare.com/#zone-settings-get-challenge-ttl-setting)
- [ ] [Get Development Mode setting](https://api.cloudflare.com/#zone-settings-get-development-mode-setting)
- [ ] [Get Email Obfuscation setting](https://api.cloudflare.com/#zone-settings-get-email-obfuscation-setting)
- [ ] [Get Hotlink Protection setting](https://api.cloudflare.com/#zone-settings-get-hotlink-protection-setting)
- [ ] [Get IP Geolocation setting](https://api.cloudflare.com/#zone-settings-get-ip-geolocation-setting)
- [ ] [Get IPv6 setting](https://api.cloudflare.com/#zone-settings-get-ipv6-setting)
- [ ] [Get Minify setting](https://api.cloudflare.com/#zone-settings-get-minify-setting)
- [ ] [Get Mobile Redirect setting](https://api.cloudflare.com/#zone-settings-get-mobile-redirect-setting)
- [ ] [Get Mirage setting](https://api.cloudflare.com/#zone-settings-get-mirage-setting)
- [ ]	~~[Get Enable Error Pages On setting](https://api.cloudflare.com/#zone-settings-get-enable-error-pages-on-setting)~~
- [ ] [Get Polish setting](https://api.cloudflare.com/#zone-settings-get-polish-setting)
- [ ]	~~[Get Prefetch Preload setting](https://api.cloudflare.com/#zone-settings-get-prefetch-preload-setting)~~
- [ ]	~~[Get Response Buffering setting](https://api.cloudflare.com/#zone-settings-get-response-buffering-setting)~~
- [ ] [Get Rocket Loader setting](https://api.cloudflare.com/#zone-settings-get-rocket-loader-setting)
- [ ] [Get Security Header (HSTS) setting](https://api.cloudflare.com/#zone-settings-get-security-header-hsts-setting)
- [ ] [Get Security Level setting](https://api.cloudflare.com/#zone-settings-get-security-level-setting)
- [ ] [Get Server Side Exclude setting](https://api.cloudflare.com/#zone-settings-get-server-side-exclude-setting)
- [ ]	~~[Get Enable Query String Sort setting](https://api.cloudflare.com/#zone-settings-get-enable-query-string-sort-setting)~~
- [ ] [Get SSL setting](https://api.cloudflare.com/#zone-settings-get-ssl-setting)
- [ ]	~~[Get Zone Enable TLS 1.2 setting](https://api.cloudflare.com/#zone-settings-get-zone-enable-tls-1-2-setting)~~
- [ ] [Get TLS Client Auth setting](https://api.cloudflare.com/#zone-settings-get-tls-client-auth-setting)
- [ ]	~~[Get True Client IP setting](https://api.cloudflare.com/#zone-settings-get-true-client-ip-setting)~~
- [ ]	~~[Get Web Application Firewall (WAF) setting](https://api.cloudflare.com/#zone-settings-get-web-application-firewall-waf-setting)~~
- [ ] [Edit zone settings info](https://api.cloudflare.com/#zone-settings-edit-zone-settings-info)
- [ ] [Change Always Online setting](https://api.cloudflare.com/#zone-settings-change-always-online-setting)
- [ ] [Change Browser Cache TTL setting](https://api.cloudflare.com/#zone-settings-change-browser-cache-ttl-setting)
- [ ] [Change Browser Check setting](https://api.cloudflare.com/#zone-settings-change-browser-check-setting)
- [ ] [Change Cache Level setting](https://api.cloudflare.com/#zone-settings-change-cache-level-setting)
- [ ] [Change Challenge TTL setting](https://api.cloudflare.com/#zone-settings-change-challenge-ttl-setting)
- [ ] [Change Development Mode setting](https://api.cloudflare.com/#zone-settings-change-development-mode-setting)
- [ ] [Change Email Obfuscation setting](https://api.cloudflare.com/#zone-settings-change-email-obfuscation-setting)
- [ ]	~~[Change Enable Error Pages On setting](https://api.cloudflare.com/#zone-settings-change-enable-error-pages-on-setting)~~
- [ ]	~~[Change Enable Query String Sort setting](https://api.cloudflare.com/#zone-settings-change-enable-query-string-sort-setting)~~
- [ ] [Change Hotlink Protection setting](https://api.cloudflare.com/#zone-settings-change-hotlink-protection-setting)
- [ ] [Change IP Geolocation setting](https://api.cloudflare.com/#zone-settings-change-ip-geolocation-setting)
- [ ] [Change IPv6 setting](https://api.cloudflare.com/#zone-settings-change-ipv6-setting)
- [ ] [Change Minify setting](https://api.cloudflare.com/#zone-settings-change-minify-setting)
- [ ] [Change Mobile Redirect setting](https://api.cloudflare.com/#zone-settings-change-mobile-redirect-setting)
- [ ]	~~[Change Mirage setting](https://api.cloudflare.com/#zone-settings-change-mirage-setting)~~
- [ ]	~~[Change Polish setting](https://api.cloudflare.com/#zone-settings-change-polish-setting)~~
- [ ]	~~[Change Prefetch Preload setting](https://api.cloudflare.com/#zone-settings-change-prefetch-preload-setting)~~
- [ ]	~~[Change Response Buffering setting](https://api.cloudflare.com/#zone-settings-change-response-buffering-setting)~~
- [ ] [Change Rocket Loader setting](https://api.cloudflare.com/#zone-settings-change-rocket-loader-setting)
- [ ] [Change Security Header (HSTS) setting](https://api.cloudflare.com/#zone-settings-change-security-header-hsts-setting)
- [ ] [Change Security Level setting](https://api.cloudflare.com/#zone-settings-change-security-level-setting)
- [ ] [Change Server Side Exclude setting](https://api.cloudflare.com/#zone-settings-change-server-side-exclude-setting)
- [ ] [Change SSL setting](https://api.cloudflare.com/#zone-settings-change-ssl-setting)
- [ ] [Change TLS Client Auth setting](https://api.cloudflare.com/#zone-settings-change-tls-client-auth-setting)
- [ ]	~~[Change True Client IP setting](https://api.cloudflare.com/#zone-settings-change-true-client-ip-setting)~~
- [ ]	~~[Change TLS 1.2 setting](https://api.cloudflare.com/#zone-settings-change-tls-1-2-setting)~~
- [ ]	~~[Change Web Application Firewall (WAF) setting](https://api.cloudflare.com/#zone-settings-change-web-application-firewall-waf-setting)~~

## [DNS Records for a Zone](https://api.cloudflare.com/#dns-records-for-a-zone)
- [ ] [Create DNS record](https://api.cloudflare.com/#dns-records-for-a-zone-create-dns-record)
- [ ] [List DNS Records](https://api.cloudflare.com/#dns-records-for-a-zone-list-dns-records)
- [ ] [DNS record details](https://api.cloudflare.com/#dns-records-for-a-zone-dns-record-details)
- [ ] [Update DNS record](https://api.cloudflare.com/#dns-records-for-a-zone-update-dns-record)
- [ ] [Delete DNS record](https://api.cloudflare.com/#dns-records-for-a-zone-delete-dns-record)

## [Railgun connections for a Zone](https://api.cloudflare.com/#railgun-connections-for-a-zone)
- [ ]	~~[Get available Railguns](https://api.cloudflare.com/#railgun-connections-for-a-zone-get-available-railguns)~~
- [ ]	~~[Get Railgun details](https://api.cloudflare.com/#railgun-connections-for-a-zone-get-railgun-details)~~
- [ ]	~~[Test Railgun connection](https://api.cloudflare.com/#railgun-connections-for-a-zone-test-railgun-connection)~~
- [ ]	~~[Connect or disconnect a Railgun](https://api.cloudflare.com/#railgun-connections-for-a-zone-connect-or-disconnect-a-railgun)~~

## [Zone Analytics](https://api.cloudflare.com/#zone-analytics)
- [ ] [Dashboard](https://api.cloudflare.com/#zone-analytics-dashboard)
- [ ]	~~[Analytics by Co-locations](https://api.cloudflare.com/#zone-analytics-analytics-by-co-locations)~~

## [Railgun](https://api.cloudflare.com/#railgun)
- [ ]	~~[Create Railgun](https://api.cloudflare.com/#railgun-create-railgun)~~
- [ ]	~~[List Railguns](https://api.cloudflare.com/#railgun-list-railguns)~~
- [ ]	~~[Railgun details](https://api.cloudflare.com/#railgun-railgun-details)~~
- [ ]	~~[Get zones connected to a Railgun](https://api.cloudflare.com/#railgun-get-zones-connected-to-a-railgun)~~
- [ ]	~~[Enable or disable a Railgun](https://api.cloudflare.com/#railgun-enable-or-disable-a-railgun)~~
- [ ]	~~[Delete Railgun](https://api.cloudflare.com/#railgun-delete-railgun)~~

## [Custom Pages for a Zone](https://api.cloudflare.com/#custom-pages-for-a-zone)
- [ ]	~~[Available Custom Pages](https://api.cloudflare.com/#custom-pages-for-a-zone-available-custom-pages)~~
- [ ]	~~[Custom Page details](https://api.cloudflare.com/#custom-pages-for-a-zone-custom-page-details)~~
- [ ]	~~[Update Custom page URL](https://api.cloudflare.com/#custom-pages-for-a-zone-update-custom-page-url)~~

## [Custom SSL for a Zone](https://api.cloudflare.com/#custom-ssl-for-a-zone)
- [ ]	~~[Create SSL configuration](https://api.cloudflare.com/#custom-ssl-for-a-zone-create-ssl-configuration)~~
- [ ]	~~[List SSL configurations](https://api.cloudflare.com/#custom-ssl-for-a-zone-list-ssl-configurations)~~
- [ ]	~~[SSL configuration details](https://api.cloudflare.com/#custom-ssl-for-a-zone-ssl-configuration-details)~~
- [ ]	~~[Update SSL configuration](https://api.cloudflare.com/#custom-ssl-for-a-zone-update-ssl-configuration)~~
- [ ]	~~[Re-prioritize SSL certificates](https://api.cloudflare.com/#custom-ssl-for-a-zone-re-prioritize-ssl-certificates)~~
- [ ]	~~[Delete an SSL certificate](https://api.cloudflare.com/#custom-ssl-for-a-zone-delete-an-ssl-certificate)~~

## [Keyless SSL for a Zone](https://api.cloudflare.com/#keyless-ssl-for-a-zone)
- [ ]	~~[Create a Keyless SSL configuration](https://api.cloudflare.com/#keyless-ssl-for-a-zone-create-a-keyless-ssl-configuration)~~
- [ ]	~~[List Keyless SSL Configurations](https://api.cloudflare.com/#keyless-ssl-for-a-zone-list-keyless-ssl-configurations)~~
- [ ]	~~[Keyless SSL details](https://api.cloudflare.com/#keyless-ssl-for-a-zone-keyless-ssl-details)~~
- [ ]	~~[Update Keyless configuration](https://api.cloudflare.com/#keyless-ssl-for-a-zone-update-keyless-configuration)~~
- [ ]	~~[Delete Keyless configuration](https://api.cloudflare.com/#keyless-ssl-for-a-zone-delete-keyless-configuration)~~

## [Firewall access rule for a Zone](https://api.cloudflare.com/#firewall-access-rule-for-a-zone)
- [x] [List access rules](https://api.cloudflare.com/#firewall-access-rule-for-a-zone-list-access-rules)
- [x] [Create access rule](https://api.cloudflare.com/#firewall-access-rule-for-a-zone-create-access-rule)
- [x] [Update access rule](https://api.cloudflare.com/#firewall-access-rule-for-a-zone-update-access-rule)
- [x] [Delete access rule](https://api.cloudflare.com/#firewall-access-rule-for-a-zone-delete-access-rule)

## [WAF Rule Packages](https://api.cloudflare.com/#waf-rule-packages)
- [ ]	~~[List firewall packages](https://api.cloudflare.com/#waf-rule-packages-list-firewall-packages)~~
- [ ]	~~[Firewall package info](https://api.cloudflare.com/#waf-rule-packages-firewall-package-info)~~
- [ ]	~~[Change anomaly-detection web application firewall package settings](https://api.cloudflare.com/#waf-rule-packages-change-anomaly-detection-web-application-firewall-package-settings)~~

## [WAF Rule Groups](https://api.cloudflare.com/#waf-rule-groups)
- [ ]	~~[List rule groups](https://api.cloudflare.com/#waf-rule-groups-list-rule-groups)~~
- [ ]	~~[Rule group info](https://api.cloudflare.com/#waf-rule-groups-rule-group-info)~~
- [ ]	~~[Update Rule group](https://api.cloudflare.com/#waf-rule-groups-update-rule-group)~~

## [WAF Rules](https://api.cloudflare.com/#waf-rules)
- [ ]	~~[List rules](https://api.cloudflare.com/#waf-rules-list-rules)~~
- [ ]	~~[Rule info](https://api.cloudflare.com/#waf-rules-rule-info)~~
- [ ]	~~[Update rule](https://api.cloudflare.com/#waf-rules-update-rule)~~

## [Organizations](https://api.cloudflare.com/#organizations)
- [ ]	~~[Organization details](https://api.cloudflare.com/#organizations-organization-details)~~
- [ ]	~~[Update organization](https://api.cloudflare.com/#organizations-update-organization)~~

## [Organization Members](https://api.cloudflare.com/#organization-members)
- [ ]	~~[List members](https://api.cloudflare.com/#organization-members-list-members)~~
- [ ]	~~[Member details](https://api.cloudflare.com/#organization-members-member-details)~~
- [ ]	~~[Update member roles](https://api.cloudflare.com/#organization-members-update-member-roles)~~
- [ ]	~~[Remove member](https://api.cloudflare.com/#organization-members-remove-member)~~

## [Organization Invites](https://api.cloudflare.com/#organization-invites)
- [ ]	~~[Create invitation](https://api.cloudflare.com/#organization-invites-create-invitation)~~
- [ ]	~~[List invitations](https://api.cloudflare.com/#organization-invites-list-invitations)~~
- [ ]	~~[Invitation details](https://api.cloudflare.com/#organization-invites-invitation-details)~~
- [ ]	~~[Update invitation roles](https://api.cloudflare.com/#organization-invites-update-invitation-roles)~~
- [ ]	~~[Cancel Invitation](https://api.cloudflare.com/#organization-invites-cancel-invitation)~~

## [Organization Roles](https://api.cloudflare.com/#organization-roles)
- [ ]	~~[List roles](https://api.cloudflare.com/#organization-roles-list-roles)~~
- [ ]	~~[Role details](https://api.cloudflare.com/#organization-roles-role-details)~~

## [Organization-level Firewall access rule](https://api.cloudflare.com/#organization-level-firewall-access-rule)
- [ ]	~~[List access rules](https://api.cloudflare.com/#organization-level-firewall-access-rule-list-access-rules)~~
- [ ]	~~[Create access rule](https://api.cloudflare.com/#organization-level-firewall-access-rule-create-access-rule)~~
- [ ]	~~[Update access rule](https://api.cloudflare.com/#organization-level-firewall-access-rule-update-access-rule)~~
- [ ]	~~[Delete access rule](https://api.cloudflare.com/#organization-level-firewall-access-rule-delete-access-rule)~~