var extend = require('xtend'),
	request = require('request'),
	querystring = require('querystring'),
	BlueBird = require('bluebird'),
	PromiseRetryer = require('promise-retryer')(BlueBird),
	PromiseObject = require('promise-object')(BlueBird),
	debug = require('debug')('http'),
	colors = require('colors'),
	Joi = require('joi');

BlueBird.promisifyAll(Joi);

/**
 * CloudFlare v4 API Client
 */
var CloudFlare = PromiseObject.create({
	initialize: function ($config) {
		this._key = $config.key;
		this._email = $config.email;

		this._itemsPerPage = $config.itemsPerPage || 100;
		this._maxRetries = $config.maxRetries || 1;
		this._raw = $config.raw || false;
	},

	API_URL: 'https://api.cloudflare.com/client/v4',

	_request: function ($deferred, schema, payload, raw) {
		var hasQuery = !!(payload && payload.query),
			hasBody = !!(payload && payload.body);

		schema = schema || {};
		payload = payload || {};

		payload.raw = raw;

		if (hasQuery) {
			payload.query = extend({
				page: 1,
				per_page: this._itemsPerPage
			}, payload.query);
		}

		if (hasBody) {
			if (hasQuery && payload.body.per_page) {
				payload.query.per_page = payload.body.per_page;
				delete payload.body.per_page;
			}

			if (hasQuery && payload.body.page) {
				payload.query.page = payload.body.page;
				delete payload.body.page;
			}
		}

		schema.path = Joi.string().required();
		schema.callee = Joi.string().required();
		schema.required = Joi.string();
		schema.method = Joi.valid(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).required();
		schema.query = extend({
			per_page: Joi.number().min(1).max(100),
			page: Joi.number().min(1)
		}, schema.query);
		schema.raw = Joi.boolean();

		$deferred.resolve(this._validateAndMakeRequest(schema, payload));
	},

	_tryRequest: function($deferred, $self, $config) {
		$config.query = extend({}, $config.query);
		$config.body = extend({}, $config.body);

		var getURL = this.API_URL + '/' + $self._resolvePath($config.path, $config.params) + (Object.keys($config.query).length ? '?' + querystring.stringify($config.query) : ''); // Construct URL with parameters

		$deferred.resolve(PromiseRetryer.run({
			delay: function (attempt) {
				return attempt * 1000;
			},
			maxRetries: $self._maxRetries,
			onAttempt: function (attempt) {
				if (attempt === 1) {
					debug(('[doapi] ' + $config.method + ' "' + getURL + '"')[attempt > 1 ? 'red' : 'grey']);
				} else {
					debug(('[doapi attempt ' + attempt + '] ' + $config.method + ' "' + getURL + '"')[attempt > 1 ? 'red' : 'grey']);
				}
			},
			promise: function (attempt) {
				return new BlueBird(function (resolve, reject) {
					request(
						{
							method: $config.method,
							url: getURL,
							json: true,
							headers: {
								'X-Auth-Key': $self._key,
								'X-Auth-Email': $self._email
							},
							body: $config.body
						},
						function(error, response, body) {
							if (!error && body && (response.statusCode < 200 || response.statusCode > 299)) {
								var error = body.errors[0] || {};

								return reject(new Error(
									'\nAPI Error: ' + (error.code + ' - ' + error.message)
								));
							} else if (error) {
								return reject(new Error(
									'Request Failed: ' + error
								));
							} else if ($config.required && !body[$config.required]) {
								return reject(new Error(
									'\nAPI Error: Response was missing required field (' + $config.required + ')'
								));
							} else {
								if ($config.raw || $self._raw && $config.raw !== false) {
									resolve(body || {});
								} else if ($config.required) {
									resolve(body[$config.required] || {});
								} else {
									resolve(body || {});
								}
							}
						}
					);
				});
			}
		}));
	},

	_resolvePath: function (path, params) {
		return path.replace(/\:([a-z0-9_-]+)\b/gi, function (string, match) {
			return params.hasOwnProperty(match) ? params[match] : string;
		});
	},

	_validateAndMakeRequest: function ($deferred, $self, schema, payload) {
		Joi.validateAsync(payload, schema, {abortEarly: false})
			.then(function () {
				$deferred.resolve($self._tryRequest(payload));
			})
			.catch(function (error) {
				var errorMessage = ('CloudFlareApiError: validation error when calling "' + payload.callee + '"\n[' + payload.method + '] /' + $self._resolvePath(payload.path, payload.params) + '\n').red;

				errorMessage += error.annotate();

				$deferred.reject(errorMessage);
			});
	},

	/**
	 * User details
	 *
	 * The currently logged in/authenticated User
	 */
	userGet: function ($deferred, raw) {
		$deferred.resolve(this._request(null, {
			callee: 'userGet',
			method: 'GET',
			path: 'user',
			required: 'result'
		}, raw));
	},

	/**
	 * Create a zone
	 *
	 * https://api.cloudflare.com/#zone-create-a-zone
	 */
	zoneNew: function ($deferred, body, raw) {
		$deferred.resolve(this._request({
			body: {
				name: Joi.string().max(253).required(),
				jump_start: Joi.boolean(),
				organization: Joi.object({
					id: Joi.string().required().length(32),
					name: Joi.string().max(100)
				})
			}
		}, {
			callee: 'zoneNew',
			method: 'POST',
			path: 'zones',
			required: 'result',
			body: body || {}
		}, raw));
	},

	/**
	 * Initiate another zone activation check
	 *
	 * https://api.cloudflare.com/#zone-initiate-another-zone-activation-check
	 */
	zoneActivationCheckNew: function ($deferred, identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneActivationCheck',
			method: 'PUT',
			path: 'zones/:identifier/activation_check',
			required: 'result',
			params: {
				identifier: identifier
			}
		}, raw));
	},

	/**
	 * List zones
	 *
	 * https://api.cloudflare.com/#zone-list-zones
	 */
	zoneGetAll: function ($deferred, query, raw) {
		$deferred.resolve(this._request({
			query: {
				name: Joi.string().max(253),
				status: Joi.any().valid('active', 'pending', 'initializing', 'moved', 'deleted', 'deactivated'),
				order: Joi.any().valid('name', 'status', 'email'),
				direction: Joi.any().valid('asc', 'desc'),
				match: Joi.any().valid('any', 'all')
			}
		}, {
			callee: 'zonesGetAll',
			method: 'GET',
			path: 'zones',
			required: 'result',
			query: query || {}
		}, raw));
	},

	/**
	 * Zone details
	 *
	 * https://api.cloudflare.com/#zone-zone-details
	 */
	zoneGet: function ($deferred, identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneGet',
			method: 'GET',
			path: 'zones/:identifier',
			required: 'result',
			params: {
				identifier: identifier
			}
		}, raw));
	},

	/**
	 * Zone update
	 *
	 * https://api.cloudflare.com/#zone-edit-zone-properties
	 */
	zoneUpdate: function($deferred, identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				identifier: Joi.string().length(32).required()
			},
			body: {
				paused: Joi.boolean(),
				vanity_name_servers: Joi.array(),
				plan: {
					id: Joi.string().max(32)
				}
			}
		}, {
			callee: 'zoneUpdate',
			method: 'PATCH',
			path: 'zones/:identifier',
			required: 'result',
			params: {
				identifier: identifier
			},
			body: body
		}, raw));
	},

	/**
	 * Zone purge cache
	 *
	 * https://api.cloudflare.com/#zone-purge-all-files
	 */
	zonePurgeCache: function($deferred, identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				identifier: Joi.string().length(32).required()
			},
			body: {
				purge_everything: Joi.boolean().required()
			}
		}, {
			callee: 'zonePurgeCache',
			method: 'DELETE',
			path: 'zones/:identifier/purge_cache',
			required: 'result',
			params: {
				identifier: identifier
			},
			body: {
				purge_everything: true
			}
		}, raw));
	},

	/**
	 * Zone purge cachge by URL or Cache-Tags
	 *
	 * https://api.cloudflare.com/#zone-purge-individual-files-by-url-and-cache-tags
	 */
	zonePurgeCacheBy: function($deferred, identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				identifier: Joi.string().length(32).required()
			},
			body: Joi.alternatives().try(
				{
					files: Joi.array().max(30).required()
				},
				{
					tags: Joi.array().max(30).required()
				}
			).required()
		}, {
			callee: 'zonePurgeCacheBy',
			method: 'DELETE',
			path: 'zones/:identifier/purge_cache',
			required: 'result',
			params: {
				identifier: identifier
			},
			body: body || {}
		}, raw));
	},

	/**
	 * Zone delete
	 *
	 * https://api.cloudflare.com/#zone-delete-a-zone
	 */
	zoneDestroy: function($deferred, identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneDestroy',
			method: 'DELETE',
			path: 'zones/:identifier',
			required: 'result',
			params: {
				identifier: identifier
			}
		}, raw));
	},

	/**
	 * Get all settings for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-get-all-zone-settings
	 */
	zoneSettingsGetAll: function ($deferred, zone_identifier, query, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneSettingsGetAll',
			method: 'GET',
			path: 'zones/:zone_identifier/settings',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			query: query
		}, raw));
	},

	/**
	 * Get always online setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-get-always-online-setting
	 */
	zoneSettingsAlwaysOnlineGet: function ($deferred, zone_identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneSettingsAlwaysOnlineGet',
			method: 'GET',
			path: 'zones/:zone_identifier/settings/always_online',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			}
		}, raw));
	},

	/**
	 * Get browser cache TTL setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-get-always-online-setting
	 */
	zoneSettingsBrowserCacheTTLGet: function ($deferred, zone_identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneSettingsBrowserCacheTTLGet',
			method: 'GET',
			path: 'zones/:zone_identifier/settings/browser_cache_ttl',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			}
		}, raw));
	},

	/**
	 * Get browser check setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-get-browser-check-setting
	 */
	zoneSettingsBrowserCheckGet: function ($deferred, zone_identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneSettingsBrowserCheckGet',
			method: 'GET',
			path: 'zones/:zone_identifier/settings/browser_check',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			}
		}, raw));
	},

	/**
	 * Get cache level setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-get-cache-level-setting
	 */
	zoneSettingsCacheLevelGet: function ($deferred, zone_identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneSettingsCacheLevelGet',
			method: 'GET',
			path: 'zones/:zone_identifier/settings/cache_level',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			}
		}, raw));
	},

	/**
	 * Get challenge TTL setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-get-challenge-ttl-setting
	 */
	zoneSettingsChallengeTTLGet: function ($deferred, zone_identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneSettingsChallengeTTLGet',
			method: 'GET',
			path: 'zones/:zone_identifier/settings/challenge_ttl',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			}
		}, raw));
	},

	/**
	 * Get development mode setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-get-development-mode-setting
	 */
	zoneSettingsDevelopmentModeGet: function ($deferred, zone_identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneSettingsDevelopmentModeGet',
			method: 'GET',
			path: 'zones/:zone_identifier/settings/development_mode',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			}
		}, raw));
	},
	
	/**
	 * Get email obfuscation setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-get-email-obfuscation-setting
	 */
	zoneSettingsEmailObfuscationGet: function ($deferred, zone_identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneSettingsEmailObfuscationGet',
			method: 'GET',
			path: 'zones/:zone_identifier/settings/email_obfuscation',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			}
		}, raw));
	},

	/**
	 * Get hotlink protection setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-get-hotlink-protection-setting
	 */
	zoneSettingsHotlinkProtectionGet: function ($deferred, zone_identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneSettingsHotlinkProtectionGet',
			method: 'GET',
			path: 'zones/:zone_identifier/settings/hotlink_protection',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			}
		}, raw));
	},

	/**
	 * Get IP geolocation setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-get-ip-geolocation-setting
	 */
	zoneSettingsIPGeolocationGet: function ($deferred, zone_identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneSettingsIPGeolocationGet',
			method: 'GET',
			path: 'zones/:zone_identifier/settings/ip_geolocation',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			}
		}, raw));
	},
	
	/**
	 * Get ipv6 setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-get-ipv6-setting
	 */
	zoneSettingsIPv6Get: function ($deferred, zone_identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneSettingsIPv6Get',
			method: 'GET',
			path: 'zones/:zone_identifier/settings/ipv6',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			}
		}, raw));
	},
	
	/**
	 * Get minify setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-get-minify-setting
	 */
	zoneSettingsMinifyGet: function ($deferred, zone_identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneSettingsMinifyGet',
			method: 'GET',
			path: 'zones/:zone_identifier/settings/minify',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			}
		}, raw));
	},

	/**
	 * Get mobile redirect setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-get-mobile-redirect-setting
	 */
	zoneSettingsMobileRedirectGet: function ($deferred, zone_identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneSettingsMobileRedirectGet',
			method: 'GET',
			path: 'zones/:zone_identifier/settings/mobile_redirect',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			}
		}, raw));
	},

	/**
	 * Get mirage setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-get-mirage-setting
	 */
	zoneSettingsMirageGet: function ($deferred, zone_identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneSettingsMirageGet',
			method: 'GET',
			path: 'zones/:zone_identifier/settings/mirage',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			}
		}, raw));
	},
	
	/**
	 * Get polish setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-get-polish-setting
	 */
	zoneSettingsPolishGet: function ($deferred, zone_identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneSettingsPolishGet',
			method: 'GET',
			path: 'zones/:zone_identifier/settings/polish',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			}
		}, raw));
	},

	/**
	 * Get rocket loader setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-get-rocket-loader-setting
	 */
	zoneSettingsRocketLoaderGet: function ($deferred, zone_identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneSettingsRocketLoaderGet',
			method: 'GET',
			path: 'zones/:zone_identifier/settings/rocket_loader',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			}
		}, raw));
	},

	/**
	 * Get security header setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-get-security-header-hsts-setting
	 */
	zoneSettingsSecurityHeaderGet: function ($deferred, zone_identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneSettingsSecurityHeaderGet',
			method: 'GET',
			path: 'zones/:zone_identifier/settings/security_header',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			}
		}, raw));
	},
	
	/**
	 * Get security level setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-get-security-level-setting
	 */
	zoneSettingsSecurityLevelGet: function ($deferred, zone_identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneSettingsSecurityLevelGet',
			method: 'GET',
			path: 'zones/:zone_identifier/settings/security_level',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			}
		}, raw));
	},
	
	/**
	 * Get server side exclude setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-get-server-side-exclude-setting
	 */
	zoneSettingsServerSideExcludeGet: function ($deferred, zone_identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneSettingsServerSideExcludeGet',
			method: 'GET',
			path: 'zones/:zone_identifier/settings/server_side_exclude',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			}
		}, raw));
	},

	/**
	 * Get SSL setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-get-ssl-setting
	 */
	zoneSettingsSSLGet: function ($deferred, zone_identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneSettingsSSLGet',
			method: 'GET',
			path: 'zones/:zone_identifier/settings/ssl',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			}
		}, raw));
	},

	/**
	 * Get TLS client auth setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-get-tls-client-auth-setting
	 */
	zoneSettingsTLSClientAuthGet: function ($deferred, zone_identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneSettingsTLSClientAuthGet',
			method: 'GET',
			path: 'zones/:zone_identifier/settings/tls_client_auth',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			}
		}, raw));
	},

	/**
	 * Update settings for zone
	 *
	 * zones/:zone_identifier/settings
	 * 
	 * https://api.cloudflare.com/#zone-settings-edit-zone-settings-info
	 */
	zoneSettingsUpdate: function($deferred, zone_identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			body: {
				items: Joi.array().items(
					Joi.object().keys({
						id: Joi.string().required(),
						value: Joi.string().required()
					}).required()
				).required()
			}
		}, {
			callee: 'zoneSettingsUpdate',
			method: 'PATCH',
			path: 'zones/:zone_identifier/settings',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			body: body
		}, raw));
	},

	/**
	 * Update always online setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-get-always-online-setting
	 */
	zoneSettingsAlwaysOnlineUpdate: function($deferred, zone_identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			body: {
				value: Joi.string().valid('on', 'off').required()
			}
		}, {
			callee: 'zoneSettingsAlwaysOnlineUpdate',
			method: 'PATCH',
			path: 'zones/:zone_identifier/settings/always_online',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			body: body
		}, raw));
	},

	/**
	 * Update browser cache TTL setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-change-browser-cache-ttl-setting
	 */
	zoneSettingsBrowserCacheTTLUpdate: function($deferred, zone_identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			body: {
				value: Joi.number().valid(
					30,
					60,
					300,
					1200,
					1800,
					3600,
					7200,
					10800,
					14400,
					18000,
					28800,
					43200,
					57600,
					72000,
					86400,
					172800,
					259200,
					345600,
					432000,
					691200,
					1382400,
					2073600,
					2678400,
					5356800,
					16070400,
					31536000
				).required()
			}
		}, {
			callee: 'zoneSettingsBrowserCacheTTLUpdate',
			method: 'PATCH',
			path: 'zones/:zone_identifier/settings/browser_cache_ttl',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			body: body
		}, raw));
	},

	/**
	 * Update browser check setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-change-browser-check-setting
	 */
	zoneSettingsBrowserCheckUpdate: function($deferred, zone_identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			body: {
				value: Joi.string().valid('on', 'off').required()
			}
		}, {
			callee: 'zoneSettingsBrowserCheckUpdate',
			method: 'PATCH',
			path: 'zones/:zone_identifier/settings/browser_check',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			body: body
		}, raw));
	},

	/**
	 * Update cache level setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-change-cache-level-setting
	 */
	zoneSettingsCacheLevelUpdate: function($deferred, zone_identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			body: {
				value: Joi.string().valid('aggressive', 'basic', 'simplified').required()
			}
		}, {
			callee: 'zoneSettingsCacheLevelUpdate',
			method: 'PATCH',
			path: 'zones/:zone_identifier/settings/cache_level',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			body: body
		}, raw));
	},

	/**
	 * Update challenge TTL setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-change-challenge-ttl-setting
	 */
	zoneSettingsChallengeTTLUpdate: function($deferred, zone_identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			body: {
				value: Joi.number().valid(
					300,
					900,
					1800,
					2700,
					3600,
					7200,
					10800,
					14400,
					28800,
					57600,
					86400,
					604800,
					2592000,
					31536000
				).required()
			}
		}, {
			callee: 'zoneSettingsChallengeTTLUpdate',
			method: 'PATCH',
			path: 'zones/:zone_identifier/settings/challenge_ttl',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			body: body
		}, raw));
	},
	
	/**
	 * Update development mode setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-change-development-mode-setting
	 */
	zoneSettingsDevelopmentModeUpdate: function($deferred, zone_identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			body: {
				value: Joi.string().valid('on', 'off').required()
			}
		}, {
			callee: 'zoneSettingsDevelopmentModeUpdate',
			method: 'PATCH',
			path: 'zones/:zone_identifier/settings/development_mode',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			body: body
		}, raw));
	},

	/**
	 * Update email obfuscation setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-change-email-obfuscation-setting
	 */
	zoneSettingsEmailObfuscationUpdate: function($deferred, zone_identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			body: {
				value: Joi.string().valid('on', 'off').required()
			}
		}, {
			callee: 'zoneSettingsEmailObfuscationUpdate',
			method: 'PATCH',
			path: 'zones/:zone_identifier/settings/email_obfuscation',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			body: body
		}, raw));
	},

	/**
	 * Update hotlink protection setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-change-hotlink-protection-setting
	 * hotlink_protection
	 */
	zoneSettingsHotlinkProtectionUpdate: function($deferred, zone_identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			body: {
				value: Joi.string().valid('on', 'off').required()
			}
		}, {
			callee: 'zoneSettingsHotlinkProtectionUpdate',
			method: 'PATCH',
			path: 'zones/:zone_identifier/settings/hotlink_protection',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			body: body
		}, raw));
	},

	/**
	 * Update IP geolocation setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-change-ip-geolocation-setting
	 * ip_geolocation
	 */
	zoneSettingsIPGeolocationUpdate: function($deferred, zone_identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			body: {
				value: Joi.string().valid('on', 'off').required()
			}
		}, {
			callee: 'zoneSettingsIPGeolocationUpdate',
			method: 'PATCH',
			path: 'zones/:zone_identifier/settings/ip_geolocation',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			body: body
		}, raw));
	},
	
	/**
	 * Update ipv6 setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-change-ipv6-setting
	 * ipv6
	 */
	zoneSettingsIPv6Update: function($deferred, zone_identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			body: {
				value: Joi.string().valid('on', 'off').required()
			}
		}, {
			callee: 'zoneSettingsIPv6Update',
			method: 'PATCH',
			path: 'zones/:zone_identifier/settings/ipv6',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			body: body
		}, raw));
	},
	
	/**
	 * Update minify setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-change-minify-setting
	 * minify
	 */
	zoneSettingsMinifyUpdate: function($deferred, zone_identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			body: {
				value: Joi.object({
					css: Joi.string().valid('on', 'off'),
					html: Joi.string().valid('on', 'off'),
					js: Joi.string().valid('on', 'off')
				}).min(1).required()
			}
		}, {
			callee: 'zoneSettingsMinifyUpdate',
			method: 'PATCH',
			path: 'zones/:zone_identifier/settings/minify',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			body: body
		}, raw));
	},

	/**
	 * Update mobile redirect setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-change-mobile-redirect-setting
	 * mobile_redirect
	 */
	zoneSettingsMobileRedirectUpdate: function($deferred, zone_identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			body: {
				value: Joi.object({
					status: Joi.string().valid('on', 'off').required(),
					mobile_subdomain: Joi.string().required(),
					strip_uri: Joi.boolean().required()
				}).required()
			}
		}, {
			callee: 'zoneSettingsMobileRedirectUpdate',
			method: 'PATCH',
			path: 'zones/:zone_identifier/settings/mobile_redirect',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			body: body
		}, raw));
	},

	// END ZONE SETTINGS

	// /**
	//  * Zone Subscription List
	//  * 
	//  * List all of your zone plan subscriptions
	//  */
	// zonesSubscriptionGetAll: function ($deferred, query, raw) {
	// 	$deferred.resolve(this._request({
	// 		query: {
	// 			order: Joi.any().valid('created_on', 'expires_on', 'activated_on', 'renewed_on', 'cancelled_on', 'name', 'status', 'price'),
	// 			status: Joi.any().valid('active', 'expired', 'cancelled'),
	// 			price: Joi.number(),
	// 			// NOTE: for dates we may need custom validation or force date objects, and later convert to our format?
	// 			activated_on: Joi.string(),
	// 			expires_on: Joi.string(),
	// 			expired_on: Joi.string(),
	// 			cancelled_on: Joi.string(),
	// 			renewed_on: Joi.string(),
	// 			direction: Joi.any().valid('asc', 'desc'),
	// 			match: Joi.any().valid('any', 'all')
	// 		}
	// 	}, {
	// 		callee: 'zonesSubscriptionGetAll',
	// 		method: 'GET',
	// 		path: 'user/billing/subscriptions/zones',
	// 		required: 'result',
	// 		query: query || {}
	// 	}, raw));
	// },


	// /**
	//  * Zone Subscription Info
	//  * 
	//  * Billing subscription details
	//  */
	// zoneSubscriptionGet: function ($deferred, identifier, raw) {
	// 	$deferred.resolve(this._request({
	// 		params: {
	// 			identifier: Joi.string().required()
	// 		}
	// 	}, {
	// 		callee: 'zoneSubscriptionGet',
	// 		method: 'GET',
	// 		path: 'user/billing/subscriptions/zones/:identifier',
	// 		required: 'result',
	// 		params: {
	// 			identifier: identifier
	// 		}
	// 	}, raw));
	// },

	/**
	 * List firewall access rules
	 *
	 * Search, sort, and filter IP/country access rules
	 */
	firewallAccessRulesGetAll: function ($deferred, query, raw) {
		$deferred.resolve(this._request({
			query: {
				mode: Joi.any().valid('block', 'challenge', 'whitelist'),
				configuration_target: Joi.any().valid('ip', 'ip_range', 'country'),
				configuration_value: Joi.string(),
				order: Joi.any().valid('configuration_target', 'configuration_value', 'mode'),
				direction: Joi.any().valid('asc', 'desc'),
				match: Joi.any().valid('any', 'all')
			}
		}, {
			callee: 'firewallAccessRulesGetAll',
			method: 'GET',
			path: 'user/firewall/access_rules/rules',
			required: 'result',
			query: query || {}
		}, raw));
	},

	/**
	 * Create firewall access rule
	 *
	 * Make a new IP, IP range, or country access rule for the zone. 
	 * 
	 * Note: If you would like to create an access rule that applies across all of your owned zones, 
	 * use the user or organization firewall endpoints as appropriate.
	 */
	firewallAccessRuleNew: function ($deferred, body, raw) {
		$deferred.resolve(this._request({
			body: {
				mode: Joi.any().valid('block', 'challenge', 'whitelist').required(),
				configuration: Joi.object({
					target: Joi.any().valid('ip', 'ip_range', 'country').required(),
					value: Joi.string().required()
				}).required(),
				notes: Joi.string()
			}
		}, {
			callee: 'firewallAccessRuleNew',
			method: 'POST',
			path: 'user/firewall/access_rules/rules',
			required: 'result',
			body: body || {}
		}, raw));
	},

	/**
	 * Update firewall access rule
	 *
	 * Update rule state and/or configuration for the zone. Note: you can only edit rules in the 'zone' group via this endpoint.
	 * Use the appropriate owner rules endpoint if trying to manage owner-level rules
	 */
	firewallAccessRuleUpdate: function($deferred, identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				identifier: Joi.string().required()
			},
			body: {
				mode: Joi.any().valid('block', 'challenge', 'whitelist').required(),
				configuration: Joi.object({
					target: Joi.any().valid('ip', 'ip_range', 'country').required(),
					value: Joi.string().required()
				}).required(),
				notes: Joi.string()
			}
		}, {
			callee: 'firewallAccessRuleUpdate',
			method: 'PATCH',
			path: 'user/firewall/access_rules/rules/:identifier',
			required: 'result',
			params: {
				identifier: identifier
			},
			body: body
		}, raw));
	},

	/**
	 * Delete firewall access rule
	 *
	 * Remove an access rule so it is no longer evaluated during requests. Optionally, specify 
	 * how to delete rules that match the mode and configuration across all other zones that this 
	 * zone owner manages. 'none' is the default, and will only delete this rule. 'basic' will delete 
	 * rules that match the same mode and configuration. 'aggressive' will delete rules that match 
	 * the same configuration.
	 */
	firewallAccessRuleDestroy: function($deferred, identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				identifier: Joi.string().required()
			}
		}, {
			callee: 'firewallAccessRuleDestroy',
			method: 'DELETE',
			path: 'user/firewall/access_rules/rules/:identifier',
			required: 'result',
			params: {
				identifier: identifier
			}
		}, raw));
	},

	
	// /**
	//  * Get user billing profile
	//  *
	//  * https://api.cloudflare.com/#user-billing-profile-billing-profile
	//  */
	// userBillingProdileGet: function ($deferred, raw) {
	// 	$deferred.resolve(this._request(null, {
	// 		callee: 'userBillingProdileGet',
	// 		method: 'GET',
	// 		path: 'user/billing/profile',
	// 		required: 'result'
	// 	}, raw));
	// },

});

module.exports = CloudFlare;