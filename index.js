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
				var errorMessage = ('DigitalOceanApiError: validation error when calling "' + payload.callee + '"\n[' + payload.method + '] /' + $self._resolvePath(payload.path, payload.params) + '\n').red;

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

	//PUT /zones/:identifier/activation_check

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