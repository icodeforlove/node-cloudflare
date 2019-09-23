var extend = require('xtend'),
	request = require('request'),
	querystring = require('querystring'),
	BlueBird = require('bluebird'),
	PromiseRetryer = require('promise-retryer')(BlueBird),
	PromiseObject = require('promise-object')(BlueBird),
	debug = require('debug')('http'),
	colors = require('colors'),
	Joi = require('joi'),
	_ = require('lodash');

BlueBird.promisifyAll(Joi);

/**
 * CloudFlare v4 API Client
 */
var CloudFlare = PromiseObject.create({
	initialize: function ($config) {
		this._key = $config.key;
		this._email = $config.email;
    this._auth_type = $config.auth_type;

		this._itemsPerPage = $config.itemsPerPage || 100;
		this._maxRetries = $config.maxRetries || 1;
		this._raw = $config.raw || false;
		this._autoPagination = $config.autoPagination || false;
		this._autoPaginationConcurrency = $config.autoPaginationConcurrency || 1;
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

			payload.pagination = {};
			if (payload.query.auto_pagination || this._autoPagination && _.isUndefined(payload.query.auto_pagination) && schema.query.auto_pagination) {
				payload.pagination.auto_pagination = true;
				payload.pagination.auto_pagination_concurrency = payload.query.auto_pagination_concurrency || this._autoPaginationConcurrency;

				delete payload.query.auto_pagination;
				delete payload.query.auto_pagination_concurrency;

				if (!schema.query.auto_pagination) {
					throw payload.callee + ': does not support pagination';
				}
			}
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

		schema.contentType = Joi.string();
		schema.path = Joi.string().required();
		schema.callee = Joi.string().required();
		schema.required = Joi.string();
		schema.method = Joi.valid(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).required();
		schema.query = extend({
			per_page: Joi.number().min(1).max(100),
			page: Joi.number().min(1)
		}, schema.query);
		schema.pagination = Joi.object({
			auto_pagination: Joi.boolean(),
			auto_pagination_concurrency: Joi.number()
		});
		schema.raw = Joi.boolean();

		$deferred.resolve(this._validateAndMakeRequest(schema, payload));
	},

	_tryRequest: function($deferred, $self, $config) {
		$config.query = extend({}, $config.query);

		if (typeof $config.body === 'object') {
			$config.body = extend({}, $config.body);
			$config.contentType = 'application/json';
		}

		var getURL = this.API_URL + '/' + $self._resolvePath($config.path, $config.params) + (Object.keys($config.query).length ? '?' + querystring.stringify($config.query) : ''); // Construct URL with parameters

		$deferred.resolve(PromiseRetryer.run({
			delay: function (attempt) {
				return attempt * 1000;
			},
			maxRetries: $self._maxRetries,
			onAttempt: function (attempt) {
				if (attempt === 1) {
					debug(('[CloudFlare] ' + $config.method + ' "' + getURL + '"')[attempt > 1 ? 'red' : 'grey']);
				} else {
					debug(('[CloudFlare Attempt ' + attempt + '] ' + $config.method + ' "' + getURL + '"')[attempt > 1 ? 'red' : 'grey']);
				}
			},
			promise: function (attempt) {
				return new BlueBird(function (resolve, reject) {
          if($self._auth_type == "token") {
            var headers = {
              'Authorization': "Bearer " + $self._key,
              'Content-Type' : 'application/json'
            }
          } else if ($self.auth_type == "x-auth") {
            var headers = {
              'X-Auth-Key': $self._key,
              'X-Auth-Email': $self._email,
              'Content-Type': $config.contentType
            }
          }
					request(
						{
							method: $config.method,
							url: getURL,
							headers: headers,
							body: typeof $config.body === 'object' ? JSON.stringify($config.body) : $config.body
						},
						function(error, response, body) {
							if (body && response.headers['content-type'].match(/application\/json/)) {
								body = JSON.parse(body);
							}

							if (!error && body && (response.statusCode < 200 || response.statusCode > 299)) {
								var error = body.errors[0] || {};

								return reject(new Error(
									'\nAPI Error: ' + (error.code + ' - ' + error.message)
								));
							} else if (error) {
								return reject(new Error(
									'Request Failed: ' + error
								));
							} else if ($config.required && body && !body[$config.required]) {
								return reject(new Error(
									'\nAPI Error: Response was missing required field (' + $config.required + ')'
								));
							} else {
								if ($config.raw || $self._raw && $config.raw !== false) {
									resolve(body || {});
								} else if (body && $config.required) {
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
				if (payload.pagination && payload.pagination.auto_pagination) {
					$deferred.resolve($self._paginateRequest(payload));
				} else {
					$deferred.resolve($self._tryRequest(payload));
				}
			})
			.catch(function (error) {
				console.log(error)
				var errorMessage = ('CloudFlareApiError: validation error when calling "' + payload.callee + '"\n[' + payload.method + '] /' + $self._resolvePath(payload.path, payload.params) + '\n').red;

				errorMessage += error.annotate();

				$deferred.reject(errorMessage);
			});
	},

	_paginateRequest: function ($deferred, $self, payload) {
		var results = [];

		payload.raw = true;

		this._tryRequest(payload).then(function (result) {
			if (!result.result_info || !result.result_info.total_pages) {
				return $deferred.resolve(result.result);
			}

			results = results.concat(result.result);

			var pages = _.range(2, result.result_info.total_pages + 1).map(function (page) {
				var pagePayload = _.cloneDeep(payload);
				pagePayload.query.page = page;
				pagePayload.raw = false;
				return pagePayload;
			});

			BlueBird.map(pages, $self._tryRequest, {concurrency: payload.pagination.auto_pagination_concurrency}).then(function (responses) {
				results = results.concat.apply(results, responses);
				$deferred.resolve(results);
			}, function (error) {
				$deferred.reject(error);
			});
		});
	},

	/**
	 * Create billing profile for user
	 *
	 * https://api.cloudflare.com/#user-billing-profile-create-billing-profile
	 */
	userBillingProfileNew: function ($deferred, body, raw) {
		$deferred.resolve(this._request({
			body: Joi.object({
				first_name: Joi.string().max(50).required(),
				last_name: Joi.string().max(90).required(),
				address: Joi.string().max(100).required(),
				city: Joi.string().max(80).required(),
				state: Joi.string().max(40).required(),
				zipcode: Joi.string().max(25).required(),
				country: Joi.string().max(50).required(),
				telephone: Joi.string().max(20).required(),
				card_number: Joi.string().max(19).required(),
				card_expiry_year: Joi.number().required(),
				card_expiry_month: Joi.number().required(),
				card_cvv: Joi.string().max(4).required(),

				address2: Joi.string().max(100),
				vat: Joi.string().max(255)
			}).required()
		}, {
			callee: 'userBillingProfileNew',
			method: 'POST',
			path: 'user/billing/profile',
			required: 'result',
			body: body
		}, raw));
	},

	/**
	 * Update billing profile for user
	 *
	 * https://api.cloudflare.com/#user-billing-profile-update-billing-profile
	 */
	userBillingProfileUpdate: function ($deferred, body, raw) {
		$deferred.resolve(this._request({
			body: Joi.object({
				first_name: Joi.string().max(50).required(),
				last_name: Joi.string().max(90).required(),
				address: Joi.string().max(100).required(),
				city: Joi.string().max(80).required(),
				state: Joi.string().max(40).required(),
				zipcode: Joi.string().max(25).required(),
				country: Joi.string().max(50).required(),
				telephone: Joi.string().max(20).required(),
				card_number: Joi.string().max(19).required(),
				card_expiry_year: Joi.number().required(),
				card_expiry_month: Joi.number().required(),
				card_cvv: Joi.string().max(4).required(),

				address2: Joi.string().max(100),
				vat: Joi.string().max(255)
			}).required()
		}, {
			callee: 'userBillingProfileUpdate',
			method: 'PUT',
			path: 'user/billing/profile',
			required: 'result',
			body: body
		}, raw));
	},

	/**
	 * Update billing profile VAT for user
	 *
	 * https://api.cloudflare.com/#user-billing-profile-update-particular-elements-of-your-billing-profile
	 */
	userBillingProfileVATUpdate: function ($deferred, body, raw) {
		$deferred.resolve(this._request({
			body: Joi.object({
				vat: Joi.string().max(255).required()
			}).required()
		}, {
			callee: 'userBillingProfileVATUpdate',
			method: 'PATCH',
			path: 'user/billing/profile',
			required: 'result',
			body: body
		}, raw));
	},

	/**
	 * Get billing profile for user
	 *
	 * https://api.cloudflare.com/#user-billing-profile-billing-profile
	 */
	userBillingProfileGet: function ($deferred, raw) {
		$deferred.resolve(this._request(null, {
			callee: 'userBillingProfileGet',
			method: 'GET',
			path: 'user/billing/profile',
			required: 'result'
		}, raw));
	},

	/**
	 * Delete billing profile for user
	 *
	 * https://api.cloudflare.com/#user-billing-profile-delete-billing-profile
	 */
	userBillingProfileDestroy: function ($deferred, raw) {
		$deferred.resolve(this._request(null, {
			callee: 'userBillingProfileDestroy',
			method: 'DELETE',
			path: 'user/billing/profile',
			required: 'result'
		}, raw));
	},

	/**
	 * Get billing history
	 *
	 * https://api.cloudflare.com/#user-billing-history-billing-history
	 */
	userBillingHistoryGetAll: function ($deferred, query, raw) {
		$deferred.resolve(this._request({
			query: {
				auto_pagination: Joi.boolean(),
				order: Joi.string().valid('type', 'occured_at', 'action'),
				type: Joi.string(),
				occured_at: Joi.string(),
				action: Joi.string()
			}
		}, {
			callee: 'userBillingHistoryGetAll',
			method: 'GET',
			path: 'user/billing/history',
			required: 'result',
			query: query || {}
		}, raw));
	},

	/**
	 * Get app subscriptions for user
	 *
	 * https://api.cloudflare.com/#app-subscription-list
	 * https://api.cloudflare.com/#app-subscription-search-sort-and-paginate
	 */
	userBillingSubscriptionsAppGetAll: function ($deferred, query, raw) {
		$deferred.resolve(this._request({
			query: {
				auto_pagination: Joi.boolean(),
				order: Joi.string().valid(
					'created_on',
					'expires_on',
					'activated_on',
					'renewed_on',
					'cancelled_on',
					'name',
					'status',
					'price'
				),
				status: Joi.string().valid('active', 'expired', 'cancelled'),
				price: Joi.number(),
				activated_on: Joi.string(),
				expires_on: Joi.string(),
				expired_on: Joi.string(),
				cancelled_on: Joi.string(),
				renewed_on: Joi.string(),
				occured_at: Joi.string(),
				action: Joi.string(),
				direction: Joi.string().valid('asc', 'desc'),
				match: Joi.string().valid('any', 'all'),
			}
		}, {
			callee: 'userBillingSubscriptionsAppGetAll',
			method: 'GET',
			path: 'user/billing/subscriptions/apps',
			required: 'result',
			query: query || {}
		}, raw));
	},

	/**
	 * Get app subscription for user
	 *
	 * https://api.cloudflare.com/#zone-zone-details
	 */
	userBillingSubscriptionsAppGet: function ($deferred, identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'userBillingSubscriptionsAppGet',
			method: 'GET',
			path: 'user/billing/subscriptions/apps/:identifier',
			required: 'result',
			params: {
				identifier: identifier
			}
		}, raw));
	},

	/**
	 * Get app subscriptions for zone
	 *
	 * https://api.cloudflare.com/#zone-subscription-list
	 * https://api.cloudflare.com/#zone-subscription-search-sort-and-paginate
	 */
	userBillingSubscriptionsZoneGetAll: function ($deferred, query, raw) {
		$deferred.resolve(this._request({
			query: {
				auto_pagination: Joi.boolean(),
				order: Joi.string().valid(
					'created_on',
					'expires_on',
					'activated_on',
					'renewed_on',
					'cancelled_on',
					'name',
					'status',
					'price'
				),
				status: Joi.string().valid('active', 'expired', 'cancelled'),
				price: Joi.number(),
				activated_on: Joi.string(),
				expires_on: Joi.string(),
				expired_on: Joi.string(),
				cancelled_on: Joi.string(),
				renewed_on: Joi.string(),
				occured_at: Joi.string(),
				action: Joi.string(),
				direction: Joi.string().valid('asc', 'desc'),
				match: Joi.string().valid('any', 'all'),
			}
		}, {
			callee: 'userBillingSubscriptionsZoneGetAll',
			method: 'GET',
			path: 'user/billing/subscriptions/zones',
			required: 'result',
			query: query || {}
		}, raw));
	},

	/**
	 * Get app subscription for zone
	 *
	 * https://api.cloudflare.com/#zone-zone-details
	 */
	userBillingSubscriptionsZoneGet: function ($deferred, identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'userBillingSubscriptionsZoneGet',
			method: 'GET',
			path: 'user/billing/subscriptions/zones/:identifier',
			required: 'result',
			params: {
				identifier: identifier
			}
		}, raw));
	},

	/**
	 * Get user details
	 *
	 * https://api.cloudflare.com/#user-user-details
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
	 * Update user details
	 *
	 * https://api.cloudflare.com/#user-update-user
	 */
	userUpdate: function ($deferred, body, raw) {
		$deferred.resolve(this._request({
			body: Joi.object({
				first_name: Joi.string().max(60),
				last_name: Joi.string().max(60),
				telephone: Joi.string().max(20),
				country: Joi.string().max(30),
				zipcode: Joi.string().max(20)
			}).required()
		}, {
			callee: 'userUpdate',
			method: 'PATCH',
			path: 'user',
			required: 'result',
			body: body
		}, raw));
	},

	/**
	 * Get all invites for user
	 *
	 * https://api.cloudflare.com/#user-s-invites-list-invitations
	 */
	userInviteGetAll: function ($deferred, query, raw) {
		$deferred.resolve(this._request({
			query: {
				auto_pagination: Joi.boolean()
			}
		}, {
			callee: 'userInviteGetAll',
			method: 'GET',
			path: 'user/invites',
			required: 'result',
			query: query || {}
		}, raw));
	},

	/**
	 * Get a invites for user
	 *
	 * https://api.cloudflare.com/#user-s-invites-list-invitations
	 */
	userInviteGet: function ($deferred, identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'userInviteGet',
			method: 'GET',
			path: 'user/invites/:identifier',
			required: 'result',
			params: {
				identifier: identifier
			}
		}, raw));
	},

	/**
	 * Update an invite for user
	 *
	 * https://api.cloudflare.com/#user-s-invites-respond-to-invitation
	 */
	userInviteUpdate: function($deferred, identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				identifier: Joi.string().length(32).required()
			},
			body: Joi.object({
				status: Joi.string().valid('accepted', 'rejected').required()
			}).required()
		}, {
			callee: 'userInviteUpdate',
			method: 'PATCH',
			path: 'user/invites/:identifier',
			required: 'result',
			params: {
				identifier: identifier
			},
			body: body
		}, raw));
	},

	/**
	 * Get all available plans for zone
	 *
	 * https://api.cloudflare.com/#zone-plan-available-plans
	 */
	zoneAvailablePlanGetAll: function ($deferred, zone_identifier, query, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			query: {
				auto_pagination: Joi.boolean()
			}
		}, {
			callee: 'zoneAvailablePlanGetAll',
			method: 'GET',
			path: 'zones/:zone_identifier/available_plans',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			query: query || {}
		}, raw));
	},

	/**
	 * Get available plan for zone
	 *
	 * https://api.cloudflare.com/#zone-plan-plan-details
	 */
	zoneAvailablePlanGet: function ($deferred, zone_identifier, identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required(),
				identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneAvailablePlanGet',
			method: 'GET',
			path: 'zones/:zone_identifier/available_plans/:identifier',
			required: 'result',
			params: {
				zone_identifier: zone_identifier,
				identifier: identifier
			}
		}, raw));
	},

	/**
	 * Create a zone
	 *
	 * https://api.cloudflare.com/#zone-create-a-zone
	 */
	zoneNew: function ($deferred, body, raw) {
		$deferred.resolve(this._request({
			body: Joi.object({
				name: Joi.string().max(253).required(),
				jump_start: Joi.boolean(),
				organization: Joi.object({
					id: Joi.string().required().length(32),
					name: Joi.string().max(100)
				})
			}).required()
		}, {
			callee: 'zoneNew',
			method: 'POST',
			path: 'zones',
			required: 'result',
			body: body
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
			callee: 'zoneActivationCheckNew',
			method: 'PUT',
			path: 'zones/:identifier/activation_check',
			required: 'result',
			params: {
				identifier: identifier
			}
		}, raw));
	},

	/**
	 * Get zones
	 *
	 * https://api.cloudflare.com/#zone-list-zones
	 */
	zoneGetAll: function ($deferred, query, raw) {
		$deferred.resolve(this._request({
			query: {
				auto_pagination: Joi.boolean(),
				name: Joi.string().max(253),
				status: Joi.string().valid('active', 'pending', 'initializing', 'moved', 'deleted', 'deactivated'),
				order: Joi.string().valid('name', 'status', 'email'),
				direction: Joi.string().valid('asc', 'desc'),
				match: Joi.string().valid('any', 'all')
			}
		}, {
			callee: 'zoneGetAll',
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
			body: Joi.object({
				paused: Joi.boolean(),
				vanity_name_servers: Joi.array(),
				plan: {
					id: Joi.string().max(32)
				}
			}).required()
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

	zoneWorkersScriptGet: function($deferred, identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneWorkersScriptGet',
			method: 'GET',
			path: 'zones/:identifier/workers/script',
			params: {
				identifier: identifier
			}
		}, raw));
	},


	zoneWorkersScriptUpdate: function($deferred, identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				identifier: Joi.string().length(32).required()
			},
			body: Joi.string().required()
		}, {
			callee: 'zoneWorkersScriptGet',
			method: 'PUT',
			path: 'zones/:identifier/workers/script',
			required: 'result',
			params: {
				identifier: identifier
			},
			contentType: 'text/javascript',
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
			body: Joi.object({
				purge_everything: Joi.boolean().required()
			}).required()
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
			body: body
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
			},
			query: {
				auto_pagination: Joi.boolean()
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
	 * Get advanced DDOS setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-get-advanced-ddos-setting
	 */
	zoneSettingsAdvancedDDOSGet: function ($deferred, zone_identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneSettingsAdvancedDDOSGet',
			method: 'GET',
			path: 'zones/:zone_identifier/settings/advanced_ddos',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			}
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
	 * Get origin error page pass through setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-get-enable-error-pages-on-setting
	 */
	zoneSettingsOriginErrorPagePassThruGet: function ($deferred, zone_identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneSettingsOriginErrorPagePassThruGet',
			method: 'GET',
			path: 'zones/:zone_identifier/settings/origin_error_page_pass_thru',
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
	 * Get prefetch preload setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-get-prefetch-preload-setting
	 */
	zoneSettingsPrefetchPreloadGet: function ($deferred, zone_identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneSettingsPrefetchPreloadGet',
			method: 'GET',
			path: 'zones/:zone_identifier/settings/prefetch_preload',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			}
		}, raw));
	},

	/**
	 * Get response buffering setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-get-response-buffering-setting
	 */
	zoneSettingsResponseBufferingGet: function ($deferred, zone_identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneSettingsResponseBufferingGet',
			method: 'GET',
			path: 'zones/:zone_identifier/settings/response_buffering',
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
	 * Get sort query string for cache setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-get-enable-query-string-sort-setting
	 */
	zoneSettingsSortQueryStringForCacheGet: function ($deferred, zone_identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneSettingsSortQueryStringForCacheGet',
			method: 'GET',
			path: 'zones/:zone_identifier/settings/sort_query_string_for_cache',
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
	 * Get true client IP header setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-get-true-client-ip-setting
	 */
	zoneSettingsTrueClientIPHeaderGet: function ($deferred, zone_identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneSettingsTrueClientIPHeaderGet',
			method: 'GET',
			path: 'zones/:zone_identifier/settings/true_client_ip_header',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			}
		}, raw));
	},

	/**
	 * Get enable TLS 1.2 setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-get-zone-enable-tls-1-2-setting
	 */
	zoneSettingsTLS1Point2OnlyGet: function ($deferred, zone_identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneSettingsTLS1Point2OnlyGet',
			method: 'GET',
			path: 'zones/:zone_identifier/settings/tls_1_2_only',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			}
		}, raw));
	},

	/**
	 * Get WAF setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-get-web-application-firewall-waf-setting
	 */
	zoneSettingsWAFGet: function ($deferred, zone_identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneSettingsWAFGet',
			method: 'GET',
			path: 'zones/:zone_identifier/settings/waf',
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
			body: Joi.object({
				items: Joi.array().items(
					Joi.object().keys({
						id: Joi.string().required(),
						value: Joi.string().required()
					}).required()
				).required()
			}).required()
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
			body: Joi.object({
				value: Joi.string().valid('on', 'off').required()
			}).required()
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
			body: Joi.object({
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
			}).required()
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
			body: Joi.object({
				value: Joi.string().valid('on', 'off').required()
			}).required()
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
			body: Joi.object({
				value: Joi.string().valid('aggressive', 'basic', 'simplified').required()
			}).required()
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
			body: Joi.object({
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
			}).required()
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
			body: Joi.object({
				value: Joi.string().valid('on', 'off').required()
			}).required()
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
			body: Joi.object({
				value: Joi.string().valid('on', 'off').required()
			}).required()
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
	 * Update origin error page pass thru setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-change-enable-error-pages-on-setting
	 */
	zoneSettingsOriginErrorPagePassThruUpdate: function($deferred, zone_identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			body: Joi.object({
				value: Joi.string().valid('on', 'off').required()
			}).required()
		}, {
			callee: 'zoneSettingsOriginErrorPagePassThruUpdate',
			method: 'PATCH',
			path: 'zones/:zone_identifier/settings/origin_error_page_pass_thru',
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
	 */
	zoneSettingsHotlinkProtectionUpdate: function($deferred, zone_identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			body: Joi.object({
				value: Joi.string().valid('on', 'off').required()
			}).required()
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
	 */
	zoneSettingsIPGeolocationUpdate: function($deferred, zone_identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			body: Joi.object({
				value: Joi.string().valid('on', 'off').required()
			}).required()
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
	 */
	zoneSettingsIPv6Update: function($deferred, zone_identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			body: Joi.object({
				value: Joi.string().valid('on', 'off').required()
			}).required()
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
	 */
	zoneSettingsMinifyUpdate: function($deferred, zone_identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			body: Joi.object({
				value: Joi.object({
					css: Joi.string().valid('on', 'off'),
					html: Joi.string().valid('on', 'off'),
					js: Joi.string().valid('on', 'off')
				}).min(1).required()
			}).required()
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
	 */
	zoneSettingsMobileRedirectUpdate: function($deferred, zone_identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			body: Joi.object({
				value: Joi.object({
					status: Joi.string().valid('on', 'off').required(),
					mobile_subdomain: Joi.string().required(),
					strip_uri: Joi.boolean().required()
				}).required()
			}).required()
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

	/**
	 * Update mirage setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-change-mirage-setting
	 */
	zoneSettingsMirageUpdate: function($deferred, zone_identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			body: Joi.object({
				value: Joi.string().valid('on', 'off').required()
			}).required()
		}, {
			callee: 'zoneSettingsMirageUpdate',
			method: 'PATCH',
			path: 'zones/:zone_identifier/settings/mirage',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			body: body
		}, raw));
	},

	/**
	 * Update polish setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-change-polish-setting
	 */
	zoneSettingsPolishUpdate: function($deferred, zone_identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			body: Joi.object({
				value: Joi.string().valid('off', 'lossless', 'lossy').required()
			}).required()
		}, {
			callee: 'zoneSettingsPolishUpdate',
			method: 'PATCH',
			path: 'zones/:zone_identifier/settings/polish',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			body: body
		}, raw));
	},

	/**
	 * Update prefetch preload setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-change-prefetch-preload-setting
	 */
	zoneSettingsPrefetchPreloadUpdate: function($deferred, zone_identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			body: Joi.object({
				value: Joi.string().valid('on', 'off').required()
			}).required()
		}, {
			callee: 'zoneSettingsPrefetchPreloadUpdate',
			method: 'PATCH',
			path: 'zones/:zone_identifier/settings/prefetch_preload',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			body: body
		}, raw));
	},

	/**
	 * Update response buffering setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-change-response-buffering-setting
	 */
	zoneSettingsResponseBufferingUpdate: function($deferred, zone_identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			body: Joi.object({
				value: Joi.string().valid('on', 'off').required()
			}).required()
		}, {
			callee: 'zoneSettingsResponseBufferingUpdate',
			method: 'PATCH',
			path: 'zones/:zone_identifier/settings/response_buffering',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			body: body
		}, raw));
	},

	/**
	 * Update rocket loader setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-change-rocket-loader-setting
	 */
	zoneSettingsRocketLoaderUpdate: function($deferred, zone_identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			body: Joi.object({
				value: Joi.string().valid('on', 'off', 'manual').required()
			}).required()
		}, {
			callee: 'zoneSettingsRocketLoaderUpdate',
			method: 'PATCH',
			path: 'zones/:zone_identifier/settings/rocket_loader',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			body: body
		}, raw));
	},

	/**
	 * Update security header setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-change-security-header-hsts-setting
	 */
	zoneSettingsSecurityHeaderUpdate: function($deferred, zone_identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			body: Joi.object({
				value: Joi.object({
					strict_transport_security: Joi.object({
						preload: Joi.boolean().required(),
						enabled: Joi.boolean().required(),
						max_age: Joi.number().max(86400).required(),
						include_subdomains: Joi.boolean().required(),
						nosniff: Joi.boolean().required()
					}).required()
				}).required()
			}).required()
		}, {
			callee: 'zoneSettingsSecurityHeaderUpdate',
			method: 'PATCH',
			path: 'zones/:zone_identifier/settings/security_header',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			body: body
		}, raw));
	},

	/**
	 * Update security level setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-change-security-level-setting
	 */
	zoneSettingsSecurityLevelUpdate: function($deferred, zone_identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			body: Joi.object({
				value: Joi.string().valid(
					'essentially_off',
					'low',
					'medium',
					'high',
					'under_attack'
				).required()
			}).required()
		}, {
			callee: 'zoneSettingsSecurityLevelUpdate',
			method: 'PATCH',
			path: 'zones/:zone_identifier/settings/security_level',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			body: body
		}, raw));
	},

	/**
	 * Update TLS auth setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-change-tls-client-auth-setting
	 */
	zoneSettingsTLSClientAuthUpdate: function($deferred, zone_identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			body: Joi.object({
				value: Joi.string().valid('on', 'off')
			}).required()
		}, {
			callee: 'zoneSettingsTLSClientAuthUpdate',
			method: 'PATCH',
			path: 'zones/:zone_identifier/settings/tls_client_auth',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			body: body
		}, raw));
	},

	/**
	 * Update true client IP header setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-change-true-client-ip-setting
	 */
	zoneSettingsTrueClientIPHeaderUpdate: function($deferred, zone_identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			body: Joi.object({
				value: Joi.string().valid('on', 'off')
			}).required()
		}, {
			callee: 'zoneSettingsTrueClientIPHeaderUpdate',
			method: 'PATCH',
			path: 'zones/:zone_identifier/settings/true_client_ip_header',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			body: body
		}, raw));
	},

	/**
	 * Update enable TLS 1.2 setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-change-tls-1-2-setting
	 */
	zoneSettingsTLS1Point2OnlyUpdate: function($deferred, zone_identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			body: Joi.object({
				value: Joi.string().valid('on', 'off')
			}).required()
		}, {
			callee: 'zoneSettingsTLS1Point2OnlyUpdate',
			method: 'PATCH',
			path: 'zones/:zone_identifier/settings/tls_1_2_only',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			body: body
		}, raw));
	},

	/**
	 * Update WAF setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-change-web-application-firewall-waf-setting
	 */
	zoneSettingsWAFUpdate: function($deferred, zone_identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			body: Joi.object({
				value: Joi.string().valid('on', 'off')
			}).required()
		}, {
			callee: 'zoneSettingsWAFUpdate',
			method: 'PATCH',
			path: 'zones/:zone_identifier/settings/waf',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			body: body
		}, raw));
	},

	/**
	 * Update server side exclude setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-change-server-side-exclude-setting
	 */
	zoneSettingsServerSideExcludeUpdate: function($deferred, zone_identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			body: Joi.object({
				value: Joi.string().valid('on', 'off').required()
			}).required()
		}, {
			callee: 'zoneSettingsServerSideExcludeUpdate',
			method: 'PATCH',
			path: 'zones/:zone_identifier/settings/server_side_exclude',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			body: body
		}, raw));
	},

	/**
	 * Update sort query string for cache setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-change-enable-query-string-sort-setting
	 */
	zoneSettingsSortQueryStringForCacheUpdate: function($deferred, zone_identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			body: Joi.object({
				value: Joi.string().valid('on', 'off').required()
			}).required()
		}, {
			callee: 'zoneSettingsSortQueryStringForCacheUpdate',
			method: 'PATCH',
			path: 'zones/:zone_identifier/settings/sort_query_string_for_cache',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			body: body
		}, raw));
	},

	/**
	 * Update SSL setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-change-ssl-setting
	 */
	zoneSettingsSSLUpdate: function($deferred, zone_identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			body: Joi.object({
				value: Joi.string().valid('off', 'flexible', 'full', 'full_strict').required()
			}).required()
		}, {
			callee: 'zoneSettingsSSLUpdate',
			method: 'PATCH',
			path: 'zones/:zone_identifier/settings/ssl',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			body: body
		}, raw));
	},

	/**
	 * Get available custom pages for zone
	 *
	 * https://api.cloudflare.com/#custom-pages-for-a-zone-available-custom-pages
	 */
	zoneCustomPageGetAll: function ($deferred, zone_identifier, query, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			query: {
				auto_pagination: Joi.boolean()
			}
		}, {
			callee: 'zoneCustomPageGetAll',
			method: 'GET',
			path: 'zones/:zone_identifier/custom_pages',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			query: query || {}
		}, raw));
	},

	/**
	 * Get available custom page for zone
	 *
	 * https://api.cloudflare.com/#custom-pages-for-a-zone-custom-page-details
	 */
	zoneCustomPageGet: function ($deferred, zone_identifier, identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required(),
				identifier: Joi.string().required()
			}
		}, {
			callee: 'zoneCustomPageGet',
			method: 'GET',
			path: 'zones/:zone_identifier/custom_pages/:identifier',
			required: 'result',
			params: {
				zone_identifier: zone_identifier,
				identifier: identifier
			}
		}, raw));
	},

	/**
	 * Update custom page URL for zone
	 *
	 * https://api.cloudflare.com/#custom-pages-for-a-zone-update-custom-page-url
	 */
	zoneCustomPageUpdate: function($deferred, zone_identifier, identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required(),
				identifier: Joi.string().required()
			},
			body: Joi.object({
				url: Joi.string().required(),
				state: Joi.string().valid('default', 'customized').required()
			}).required()
		}, {
			callee: 'zoneCustomPageUpdate',
			method: 'PUT',
			path: 'zones/:zone_identifier/custom_pages/:identifier',
			required: 'result',
			params: {
				zone_identifier: zone_identifier,
				identifier: identifier
			},
			body: body
		}, raw));
	},

	/**
	 * Get WAF packages for zone
	 *
	 * https://api.cloudflare.com/#waf-rule-packages-list-firewall-packages
	 */
	zoneFirewallWAFPackageGetAll: function ($deferred, zone_identifier, query, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			query: {
				auto_pagination: Joi.boolean(),
				name: Joi.string(),
				order: Joi.string(), // NOTE: This is not clarified properly in their docs
				direction: Joi.string().valid('asc', 'desc'),
				match: Joi.string().valid('any', 'all')
			}
		}, {
			callee: 'zoneFirewallWAFPackageGetAll',
			method: 'GET',
			path: 'zones/:zone_identifier/firewall/waf/packages',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			query: query || {}
		}, raw));
	},

	/**
	 * Get WAF package for zone
	 *
	 * https://api.cloudflare.com/#waf-rule-packages-firewall-package-info
	 */
	zoneFirewallWAFPackageGet: function ($deferred, zone_identifier, identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required(),
				identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneFirewallWAFPackageGet',
			method: 'GET',
			path: 'zones/:zone_identifier/firewall/waf/packages/:identifier',
			required: 'result',
			params: {
				zone_identifier: zone_identifier,
				identifier: identifier
			}
		}, raw));
	},

	/**
	 * Update WAF package for zone
	 *
	 * https://api.cloudflare.com/#waf-rule-packages-change-anomaly-detection-web-application-firewall-package-settings
	 */
	zoneFirewallWAFPackageUpdate: function ($deferred, zone_identifier, identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required(),
				identifier: Joi.string().length(32).required()
			},
			body: Joi.object({
				sensitivity: Joi.string().valid('high', 'low', 'off'),
				action_mode: Joi.string().valid('simulate', 'block', 'challenge')
			}).min(1).required()
		}, {
			callee: 'zoneFirewallWAFPackageUpdate',
			method: 'PATCH',
			path: 'zones/:zone_identifier/firewall/waf/packages/:identifier',
			required: 'result',
			params: {
				zone_identifier: zone_identifier,
				identifier: identifier
			},
			body: body
		}, raw));
	},

	/**
	 * Get WAF rule groups for zone
	 *
	 * https://api.cloudflare.com/#waf-rule-groups-list-rule-groups
	 */
	zoneFirewallWAFRuleGroupGetAll: function ($deferred, zone_identifier, package_identifier, query, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required(),
				package_identifier: Joi.string().length(32).required()
			},
			query: {
				auto_pagination: Joi.boolean(),
				name: Joi.string(),
				mode: Joi.string().valid('on', 'off'),
				rules_count: Joi.number(),
				order: Joi.string().valid('mode', 'rules_count'),
				direction: Joi.string().valid('asc', 'desc'),
				match: Joi.string().valid('any', 'all')
			}
		}, {
			callee: 'zoneFirewallWAFRuleGroupGetAll',
			method: 'GET',
			path: 'zones/:zone_identifier/firewall/waf/packages/:package_identifier/groups',
			required: 'result',
			params: {
				zone_identifier: zone_identifier,
				package_identifier: package_identifier
			},
			query: query || {}
		}, raw));
	},

	/**
	 * Get WAF rule group for zone
	 *
	 * https://api.cloudflare.com/#waf-rule-groups-rule-group-info
	 */
	zoneFirewallWAFRuleGroupGet: function ($deferred, zone_identifier, package_identifier, identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required(),
				package_identifier: Joi.string().length(32).required(),
				identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneFirewallWAFRuleGroupGet',
			method: 'GET',
			path: 'zones/:zone_identifier/firewall/waf/packages/:package_identifier/groups/:identifier',
			required: 'result',
			params: {
				zone_identifier: zone_identifier,
				package_identifier: package_identifier,
				identifier: identifier
			}
		}, raw));
	},

	/**
	 * Update WAF rule group for zone
	 *
	 * https://api.cloudflare.com/#waf-rule-groups-update-rule-group
	 */
	zoneFirewallWAFRuleGroupUpdate: function ($deferred, zone_identifier, package_identifier, identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required(),
				package_identifier: Joi.string().length(32).required(),
				identifier: Joi.string().length(32).required()
			},
			body: Joi.object({
				mode: Joi.string().valid('on', 'off')
			}).required()
		}, {
			callee: 'zoneFirewallWAFRuleGroupUpdate',
			method: 'PATCH',
			path: 'zones/:zone_identifier/firewall/waf/packages/:package_identifier/groups/:identifier',
			required: 'result',
			params: {
				zone_identifier: zone_identifier,
				package_identifier: package_identifier,
				identifier: identifier
			},
			body: body
		}, raw));
	},

	/**
	 * Get WAF package rules for zone
	 *
	 * https://api.cloudflare.com/#waf-rules-list-rules
	 */
	zoneFirewallWAFPackageRuleGetAll: function ($deferred, zone_identifier, package_identifier, query, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required(),
				package_identifier: Joi.string().length(32).required()
			},
			query: {
				auto_pagination: Joi.boolean(),
				description: Joi.string(),
				mode: Joi.any(), // NOTE: documentation was very unclear about this param
				priority: Joi.number(),
				group_id: Joi.string().length(32),
				order: Joi.string().valid('priority', 'group_id', 'description'),
				direction: Joi.string().valid('asc', 'desc'),
				match: Joi.string().valid('any', 'all')
			}
		}, {
			callee: 'zoneFirewallWAFPackageRuleGetAll',
			method: 'GET',
			path: 'zones/:zone_identifier/firewall/waf/packages/:package_identifier/rules',
			required: 'result',
			params: {
				zone_identifier: zone_identifier,
				package_identifier: package_identifier
			},
			query: query || {}
		}, raw));
	},

	/**
	 * Get WAF package rule for zone
	 *
	 * https://api.cloudflare.com/#waf-rules-rule-info
	 */
	zoneFirewallWAFPackageRuleGet: function ($deferred, zone_identifier, package_identifier, identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required(),
				package_identifier: Joi.string().length(32).required(),
				identifier: Joi.string().required()
			}
		}, {
			callee: 'zoneFirewallWAFPackageRuleGet',
			method: 'GET',
			path: 'zones/:zone_identifier/firewall/waf/packages/:package_identifier/rules/:identifier',
			required: 'result',
			params: {
				zone_identifier: zone_identifier,
				package_identifier: package_identifier,
				identifier: identifier
			}
		}, raw));
	},

	/**
	 * Update WAF package rule for zone
	 *
	 * https://api.cloudflare.com/#waf-rules-update-rule
	 */
	zoneFirewallWAFPackageRuleUpdate: function ($deferred, zone_identifier, package_identifier, identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required(),
				package_identifier: Joi.string().length(32).required(),
				identifier: Joi.string().required()
			},
			body: Joi.object({
				mode: Joi.string().valid('default', 'disable', 'simulate', 'block', 'challenge', 'on', 'off').required()
			}).required()
		}, {
			callee: 'zoneFirewallWAFPackageRuleUpdate',
			method: 'PATCH',
			path: 'zones/:zone_identifier/firewall/waf/packages/:package_identifier/rules/:identifier',
			required: 'result',
			params: {
				zone_identifier: zone_identifier,
				package_identifier: package_identifier,
				identifier: identifier
			},
			body: body
		}, raw));
	},

	/**
	 * List DNS records for zone
	 *
	 * https://api.cloudflare.com/#dns-records-for-a-zone-list-dns-records
	 */
	zoneDNSRecordGetAll: function ($deferred, zone_identifier, query, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			query: {
				auto_pagination: Joi.boolean(),
				type: Joi.string().valid('A', 'AAAA', 'CNAME', 'TXT', 'SRV', 'LOC', 'MX', 'NS', 'SPF'),
				name: Joi.string().max(255),
				content: Joi.string(),
				order: Joi.string().valid('type', 'name', 'content', 'ttl', 'proxied'),
				direction: Joi.string().valid('asc', 'desc'),
				match: Joi.string().valid('any', 'all')
			}
		}, {
			callee: 'zoneDNSRecordGetAll',
			method: 'GET',
			path: 'zones/:zone_identifier/dns_records',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			query: query || {}
		}, raw));
	},

	/**
	 * Create DNS record for zone
	 *
	 * https://api.cloudflare.com/#dns-records-for-a-zone-create-dns-record
	 */
	zoneDNSRecordNew: function ($deferred, zone_identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			body: Joi.object({
				type: Joi.string().valid('A', 'AAAA', 'CNAME', 'TXT', 'SRV', 'LOC', 'MX', 'NS', 'SPF').required(),
				name: Joi.string().max(255).required(),
				content: Joi.string().required(),
				ttl: Joi.number().max(2147483647),
				proxied: Joi.boolean(),
				priority: Joi.number().max(65535).when('type', { is: 'MX', then: Joi.required(), otherwise: Joi.forbidden() })
			}).required()
		}, {
			callee: 'zoneDNSRecordNew',
			method: 'POST',
			path: 'zones/:zone_identifier/dns_records',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			body: body
		}, raw));
	},


	/**
	 * Get DNS record for zone
	 *
	 * https://api.cloudflare.com/#dns-records-for-a-zone-dns-record-details
	 */
	zoneDNSRecordGet: function ($deferred, zone_identifier, identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required(),
				identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneDNSRecordGet',
			method: 'GET',
			path: 'zones/:zone_identifier/dns_records/:identifier',
			required: 'result',
			params: {
				zone_identifier: zone_identifier,
				identifier: identifier
			}
		}, raw));
	},

	/**
	 * Update dns record for zone
	 *
	 * https://api.cloudflare.com/#dns-records-for-a-zone-update-dns-record
	 */
	zoneDNSRecordUpdate: function ($deferred, zone_identifier, identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required(),
				identifier: Joi.string().length(32).required()
			},
			body: Joi.object({
				type: Joi.string().valid('A', 'AAAA', 'CNAME', 'TXT', 'SRV', 'LOC', 'MX', 'NS', 'SPF'),
				name: Joi.string().max(255),
				content: Joi.string(),
				ttl: Joi.number().max(2147483647),
				proxied: Joi.boolean()
			}).min(1).required()
		}, {
			callee: 'zoneDNSRecordUpdate',
			method: 'PATCH',
			path: 'zones/:zone_identifier/dns_records/:identifier',
			required: 'result',
			params: {
				zone_identifier: zone_identifier,
				identifier: identifier
			},
			body: body
		}, raw));
	},

	/**
	 * Delete dns record for zone
	 *
	 * https://api.cloudflare.com/#dns-records-for-a-zone-delete-dns-record
	 */
	zoneDNSRecordDestroy: function ($deferred, zone_identifier, identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required(),
				identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneDNSRecordDestroy',
			method: 'DELETE',
			path: 'zones/:zone_identifier/dns_records/:identifier',
			required: 'result',
			params: {
				zone_identifier: zone_identifier,
				identifier: identifier
			}
		}, raw));
	},

	/**
	 * Get analytics dashboard data
	 *
	 * https://api.cloudflare.com/#zone-analytics-dashboard
	 */
	zoneAnalyticsDashboardGet: function ($deferred, zone_identifier, query, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			query: {
				since: Joi.alternatives().try(Joi.string(), Joi.number()),
				until: Joi.alternatives().try(Joi.string(), Joi.number()),
				exclude_series: Joi.boolean(),
				continuous: Joi.boolean()
			}
		}, {
			callee: 'zoneAnalyticsDashboardGet',
			method: 'GET',
			path: 'zones/:zone_identifier/analytics/dashboard',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			query: query || {}
		}, raw));
	},

	/**
	 * Get analytics dashboard data
	 *
	 * https://api.cloudflare.com/#zone-analytics-dashboard
	 */
	zoneAnalyticsColosGetAll: function ($deferred, zone_identifier, query, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			query: {
				auto_pagination: Joi.boolean(),
				since: Joi.alternatives().try(Joi.string(), Joi.number()),
				until: Joi.alternatives().try(Joi.string(), Joi.number()),
				exclude_series: Joi.boolean(),
				continuous: Joi.boolean()
			}
		}, {
			callee: 'zoneAnalyticsColosGetAll',
			method: 'GET',
			path: 'zones/:zone_identifier/analytics/colos',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			query: query || {}
		}, raw));
	},

	/**
	 * List firewall access rules for zone
	 *
	 * https://api.cloudflare.com/#firewall-access-rule-for-a-zone-list-access-rules
	 */
	zoneFirewallAccessRuleGetAll: function ($deferred, zone_identifier, query, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			query: {
				auto_pagination: Joi.boolean(),
				mode: Joi.string().valid('block', 'challenge', 'whitelist'),
				configuration_target: Joi.string().valid('ip', 'ip_range', 'country'),
				configuration_value: Joi.string(),
				order: Joi.string().valid('configuration_target', 'configuration_value', 'mode'),
				direction: Joi.string().valid('asc', 'desc'),
				match: Joi.string().valid('any', 'all')
			}
		}, {
			callee: 'zoneFirewallAccessRuleGetAll',
			method: 'GET',
			path: 'zones/:zone_identifier/firewall/access_rules/rules',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			query: query || {}
		}, raw));
	},

	/**
	 * Create firewall access rule for zone
	 *
	 * https://api.cloudflare.com/#firewall-access-rule-for-a-zone-create-access-rule
	 */
	zoneFirewallAccessRuleNew: function ($deferred, zone_identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			body: Joi.object({
				mode: Joi.string().valid('block', 'challenge', 'whitelist').required(),
				configuration: Joi.object({
					target: Joi.string().valid('ip', 'ip_range', 'country').required(),
					value: Joi.string().required()
				}).required(),
				notes: Joi.string()
			}).required()
		}, {
			callee: 'zoneFirewallAccessRuleNew',
			method: 'POST',
			path: 'zones/:zone_identifier/firewall/access_rules/rules',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			body: body
		}, raw));
	},

	/**
	 * Update firewall access rule for zone
	 *
	 * https://api.cloudflare.com/#firewall-access-rule-for-a-zone-update-access-rule
	 */
	zoneFirewallAccessRuleUpdate: function($deferred, zone_identifier, identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required(),
				identifier: Joi.string().length(32).required()
			},
			body: Joi.object({
				mode: Joi.string().valid('block', 'challenge', 'whitelist').required(),
				configuration: Joi.object({
					target: Joi.string().valid('ip', 'ip_range', 'country').required(),
					value: Joi.string().required()
				}).required(),
				notes: Joi.string()
			}).required()
		}, {
			callee: 'zoneFirewallAccessRuleUpdate',
			method: 'PATCH',
			path: 'zones/:zone_identifier/firewall/access_rules/rules/:identifier',
			required: 'result',
			params: {
				zone_identifier: zone_identifier,
				identifier: identifier
			},
			body: body
		}, raw));
	},

	/**
	 * Delete firewall access rule for zone
	 *
	 * https://api.cloudflare.com/#firewall-access-rule-for-a-zone-delete-access-rule
	 */
	zoneFirewallAccessRuleDestroy: function($deferred, zone_identifier, identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required(),
				identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneFirewallAccessRuleDestroy',
			method: 'DELETE',
			path: 'zones/:zone_identifier/firewall/access_rules/rules/:identifier',
			required: 'result',
			params: {
				zone_identifier: zone_identifier,
				identifier: identifier
			},
		}, raw));
	},

	/**
	 * List firewall access rules for user
	 *
	 * https://api.cloudflare.com/#user-level-firewall-access-rule-list-access-rules
	 */
	userFirewallAccessRuleGetAll: function ($deferred, query, raw) {
		$deferred.resolve(this._request({
			query: {
				auto_pagination: Joi.boolean(),
				mode: Joi.string().valid('block', 'challenge', 'whitelist'),
				configuration_target: Joi.string().valid('ip', 'ip_range', 'country'),
				configuration_value: Joi.string(),
				order: Joi.string().valid('configuration_target', 'configuration_value', 'mode'),
				direction: Joi.string().valid('asc', 'desc'),
				match: Joi.string().valid('any', 'all')
			}
		}, {
			callee: 'userFirewallAccessRuleGetAll',
			method: 'GET',
			path: 'user/firewall/access_rules/rules',
			required: 'result',
			query: query || {}
		}, raw));
	},

	/**
	 * Create firewall access rule for user
	 *
	 * https://api.cloudflare.com/#user-level-firewall-access-rule-create-access-rule
	 */
	userFirewallAccessRuleNew: function ($deferred, body, raw) {
		$deferred.resolve(this._request({
			body: Joi.object({
				mode: Joi.string().valid('block', 'challenge', 'whitelist').required(),
				configuration: Joi.object({
					target: Joi.string().valid('ip', 'ip_range', 'country').required(),
					value: Joi.string().required()
				}).required(),
				notes: Joi.string()
			}).required()
		}, {
			callee: 'userFirewallAccessRuleNew',
			method: 'POST',
			path: 'user/firewall/access_rules/rules',
			required: 'result',
			body: body
		}, raw));
	},

	/**
	 * Update firewall access rule for user
	 *
	 * https://api.cloudflare.com/#user-level-firewall-access-rule-update-access-rule
	 */
	userFirewallAccessRuleUpdate: function($deferred, identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				identifier: Joi.string().length(32).required()
			},
			body: Joi.object({
				mode: Joi.string().valid('block', 'challenge', 'whitelist').required(),
				configuration: Joi.object({
					target: Joi.string().valid('ip', 'ip_range', 'country').required(),
					value: Joi.string().required()
				}).required(),
				notes: Joi.string()
			}).required()
		}, {
			callee: 'userFirewallAccessRuleUpdate',
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
	 * Delete firewall access rule for user
	 *
	 * https://api.cloudflare.com/#user-level-firewall-access-rule-delete-access-rule
	 */
	userFirewallAccessRuleDestroy: function($deferred, identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'userFirewallAccessRuleDestroy',
			method: 'DELETE',
			path: 'user/firewall/access_rules/rules/:identifier',
			required: 'result',
			params: {
				identifier: identifier
			}
		}, raw));
	},

	/**
	 * Get user organizations
	 *
	 * https://api.cloudflare.com/#user-s-organizations-list-organizations
	 */
	userOrganizationGetAll: function ($deferred, query, raw) {
		$deferred.resolve(this._request({
			query: {
				auto_pagination: Joi.boolean(),
				status: Joi.string().valid('member', 'invited'),
				name: Joi.string().max(100),
				order: Joi.string().valid('id', 'name', 'status'),
				direction: Joi.string().valid('asc', 'desc'),
				match: Joi.string().valid('any', 'all')
			}
		}, {
			callee: 'userOrganizationGetAll',
			method: 'GET',
			path: 'user/organizations',
			required: 'result',
			query: query || {}
		}, raw));
	},

	/**
	 * Get user organization
	 *
	 * https://api.cloudflare.com/#user-s-organizations-organization-details
	 */
	userOrganizationGet: function ($deferred, identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'userOrganizationGet',
			method: 'GET',
			path: 'user/organizations/:identifier',
			required: 'result',
			params: {
				identifier: identifier
			}
		}, raw));
	},

	/**
	 * Remove user organization
	 *
	 * https://api.cloudflare.com/#user-s-organizations-leave-organization
	 */
	userOrganizationDestroy: function($deferred, identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'userOrganizationDestroy',
			method: 'DELETE',
			path: 'user/organizations/:identifier',
			required: 'result',
			params: {
				identifier: identifier
			}
		}, raw));
	},

	/**
	 * Create a railgun
	 *
	 * https://api.cloudflare.com/#railgun-create-railgun
	 */
	railgunNew: function ($deferred, body, raw) {
		$deferred.resolve(this._request({
			body: Joi.object({
				name: Joi.string().max(160).required()
			}).required()
		}, {
			callee: 'railgunNew',
			method: 'POST',
			path: 'railguns',
			required: 'result',
			body: body
		}, raw));
	},

	/**
	 * Get railguns
	 *
	 * https://api.cloudflare.com/#railgun-list-railguns
	 */
	railgunGetAll: function ($deferred, query, raw) {
		$deferred.resolve(this._request({
			query: {
				auto_pagination: Joi.boolean(),
				direction: Joi.string().valid('asc', 'desc')
			}
		}, {
			callee: 'railgunGetAll',
			method: 'GET',
			path: 'railguns',
			required: 'result',
			query: query || {}
		}, raw));
	},

	/**
	 * Get railgun
	 *
	 * https://api.cloudflare.com/#railgun-railgun-details
	 */
	railgunGet: function ($deferred, identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'railgunGet',
			method: 'GET',
			path: 'railguns/:identifier',
			required: 'result',
			params: {
				identifier: identifier
			}
		}, raw));
	},

	/**
	 * Get zones for railgun
	 *
	 * https://api.cloudflare.com/#railgun-get-zones-connected-to-a-railgun
	 */
	railgunZoneGetAll: function ($deferred, identifier, query, raw) {
		$deferred.resolve(this._request({
			params: {
				identifier: Joi.string().length(32).required()
			},
			query: {
				auto_pagination: Joi.boolean()
			}
		}, {
			callee: 'railgunZoneGetAll',
			method: 'GET',
			path: 'railguns/:identifier/zones',
			required: 'result',
			params: {
				identifier: identifier
			},
			query: query || {}
		}, raw));
	},

	/**
	 * Update enabled for a railgun
	 *
	 * https://api.cloudflare.com/#railgun-enable-or-disable-a-railgun
	 */
	railgunEnabledUpdate: function($deferred, identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				identifier: Joi.string().length(32).required()
			},
			body: Joi.object({
				enabled: Joi.boolean().required()
			}).required()
		}, {
			callee: 'railgunEnabledUpdate',
			method: 'PATCH',
			path: 'railguns/:identifier',
			required: 'result',
			params: {
				identifier: identifier
			},
			body: body
		}, raw));
	},

	/**
	 * Delete a railgun
	 *
	 * https://api.cloudflare.com/#railgun-delete-railgun
	 */
	railgunDestroy: function($deferred, identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'railgunDestroy',
			method: 'DELETE',
			path: 'railguns/:identifier',
			required: 'result',
			params: {
				identifier: identifier
			}
		}, raw));
	},

	/**
	 * Get railguns for zone
	 *
	 * https://api.cloudflare.com/#railgun-connections-for-a-zone-get-available-railguns
	 */
	zoneRailgunGetAll: function ($deferred, zone_identifier, query, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			query: {
				auto_pagination: Joi.boolean()
			}
		}, {
			callee: 'zoneRailgunGetAll',
			method: 'GET',
			path: 'zones/:zone_identifier/railguns',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			query: query || {}
		}, raw));
	},

	/**
	 * Get railgun for zone
	 *
	 * https://api.cloudflare.com/#railgun-connections-for-a-zone-get-railgun-details
	 */
	zoneRailgunGet: function ($deferred, zone_identifier, identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required(),
				identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneRailgunGet',
			method: 'GET',
			path: 'zones/:zone_identifier/railguns/:identifier',
			required: 'result',
			params: {
				zone_identifier: zone_identifier,
				identifier: identifier
			}
		}, raw));
	},

	/**
	 * Get diagnoses for railgun for zone
	 *
	 * https://api.cloudflare.com/#railgun-connections-for-a-zone-test-railgun-connection
	 */
	zoneRailgunDiagnoseGet: function ($deferred, zone_identifier, identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required(),
				identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneRailgunDiagnoseGet',
			method: 'GET',
			path: 'zones/:zone_identifier/railguns/:identifier/diagnose',
			required: 'result',
			params: {
				zone_identifier: zone_identifier,
				identifier: identifier
			}
		}, raw));
	},

	/**
	 * Connect or disconnect a railgun for a zone
	 *
	 * https://api.cloudflare.com/#railgun-connections-for-a-zone-connect-or-disconnect-a-railgun
	 */
	zoneRailgunConnectedUpdate: function($deferred, zone_identifier, identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required(),
				identifier: Joi.string().length(32).required()
			},
			body: Joi.object({
				connected: Joi.boolean().required()
			}).required()
		}, {
			callee: 'zoneRailgunConnectedUpdate',
			method: 'PATCH',
			path: 'zones/:zone_identifier/railguns/:identifier',
			required: 'result',
			params: {
				zone_identifier: zone_identifier,
				identifier: identifier
			},
			body: body
		}, raw));
	},

	/**
	 * Create custom certificate for a zone
	 *
	 * https://api.cloudflare.com/#custom-ssl-for-a-zone-create-ssl-configuration
	 */
	zoneCustomCertificateNew: function ($deferred, zone_identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			body: Joi.object({
				certificate: Joi.string().required(),
				private_key: Joi.string().required(),
				bundle_method: Joi.string().valid('ubiquitous', 'optimal', 'force')
			}).required()
		}, {
			callee: 'zoneCustomCertificateNew',
			method: 'POST',
			path: 'zones/:zone_identifier/custom_certificates',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			body: body
		}, raw));
	},

	/**
	 * Get custom certificates for a zone
	 *
	 * https://api.cloudflare.com/#custom-ssl-for-a-zone-list-ssl-configurations
	 */
	zoneCustomCertificateGetAll: function ($deferred, zone_identifier, query, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			query: {
				auto_pagination: Joi.boolean(),
				status: Joi.string().valid('active', 'expired', 'deleted'),
				order: Joi.string().valid('status', 'issuer', 'priority', 'expires_on'),
				direction: Joi.string().valid('asc', 'desc'),
				match: Joi.string().valid('any', 'all')
			}
		}, {
			callee: 'zoneCustomCertificateGetAll',
			method: 'GET',
			path: 'zones/:zone_identifier/custom_certificates',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			query: query || {}
		}, raw));
	},

	/**
	 * Get a custom certificate for a zone
	 *
	 * https://api.cloudflare.com/#custom-ssl-for-a-zone-ssl-configuration-details
	 */
	zoneCustomCertificateGet: function ($deferred, zone_identifier, identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required(),
				identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneCustomCertificateGet',
			method: 'GET',
			path: 'zones/:zone_identifier/custom_certificates/:identifier',
			required: 'result',
			params: {
				zone_identifier: zone_identifier,
				identifier: identifier
			}
		}, raw));
	},

	/**
	 * Update a custom certificate for a zone
	 *
	 * https://api.cloudflare.com/#custom-ssl-for-a-zone-re-prioritize-ssl-certificates
	 */
	zoneCustomCertificateUpdate: function($deferred, zone_identifier, identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required(),
				identifier: Joi.string().length(32).required()
			},
			body: Joi.object({
				certificate: Joi.string().required(),
				private_key: Joi.string().required(),
				bundle_method: Joi.string().valid('ubiquitous', 'optimal', 'force')
			}).required()
		}, {
			callee: 'zoneCustomCertificateUpdate',
			method: 'PATCH',
			path: 'zones/:zone_identifier/custom_certificates/:identifier',
			required: 'result',
			params: {
				zone_identifier: zone_identifier,
				identifier: identifier
			},
			body: body
		}, raw));
	},

	/**
	 * Update custom certificate prioritization for a zone
	 *
	 * https://api.cloudflare.com/#custom-ssl-for-a-zone-re-prioritize-ssl-certificates
	 */
	zoneCustomCertificatePriorityUpdate: function($deferred, zone_identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			body: Joi.object({
				certificates: Joi.array().items(
					Joi.object({
						ids: Joi.string().length(32).required(),
						priority: Joi.number().required()
					}).required()
				).required()
			}).required()
		}, {
			callee: 'zoneCustomCertificatePriorityUpdate',
			method: 'PUT',
			path: 'zones/:zone_identifier/custom_certificates/prioritize',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			body: body
		}, raw));
	},

	/**
	 * Delete a custom certificate from a zone
	 *
	 * https://api.cloudflare.com/#custom-ssl-for-a-zone-delete-an-ssl-certificate
	 */
	zoneCustomCertificateDestroy: function($deferred, zone_identifier, identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required(),
				identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneCustomCertificateDestroy',
			method: 'DELETE',
			path: 'zones/:zone_identifier/custom_certificates/:identifier',
			required: 'result',
			params: {
				zone_identifier: zone_identifier,
				identifier: identifier
			},
		}, raw));
	},

	/**
	 * Create keyless certificate for a zone
	 *
	 * https://api.cloudflare.com/#custom-ssl-for-a-zone-create-ssl-configuration
	 */
	zoneKeylessCertificateNew: function ($deferred, zone_identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			body: Joi.object({
				host: Joi.string().max(253).required(),
				port: Joi.number().max(65535).required(),
				name: Joi.string().max(180).required(),
				certificate: Joi.string().required(),
				bundle_method: Joi.string().valid('ubiquitous', 'optimal', 'force')
			}).required()
		}, {
			callee: 'zoneKeylessCertificateNew',
			method: 'POST',
			path: 'zones/:zone_identifier/keyless_certificates',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			body: body
		}, raw));
	},

	/**
	 * Get keyless certificates for a zone
	 *
	 * https://api.cloudflare.com/#custom-ssl-for-a-zone-list-ssl-configurations
	 */
	zoneKeylessCertificateGetAll: function ($deferred, zone_identifier, query, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			query: {
				auto_pagination: Joi.boolean(),
				status: Joi.string().valid('active', 'expired', 'deleted'),
				order: Joi.string().valid('status'),
				direction: Joi.string().valid('asc', 'desc'),
				match: Joi.string().valid('any', 'all')
			}
		}, {
			callee: 'zoneKeylessCertificateGetAll',
			method: 'GET',
			path: 'zones/:zone_identifier/keyless_certificates',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			query: query || {}
		}, raw));
	},

	/**
	 * Get a keyless certificate for a zone
	 *
	 * hhttps://api.cloudflare.com/#keyless-ssl-for-a-zone-keyless-ssl-details
	 */
	zoneKeylessCertificateGet: function ($deferred, zone_identifier, identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required(),
				identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneKeylessCertificateGet',
			method: 'GET',
			path: 'zones/:zone_identifier/keyless_certificates/:identifier',
			required: 'result',
			params: {
				zone_identifier: zone_identifier,
				identifier: identifier
			}
		}, raw));
	},

	/**
	 * Update a keyless certificate for a zone
	 *
	 * https://api.cloudflare.com/#keyless-ssl-for-a-zone-update-keyless-configuration
	 */
	zoneKeylessCertificateUpdate: function($deferred, zone_identifier, identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required(),
				identifier: Joi.string().length(32).required()
			},
			body: Joi.object({
				host: Joi.string().max(253).required(),
				port: Joi.number().max(65535).required(),
				name: Joi.string().max(180).required(),
				enabled: Joi.boolean()
			}).required()
		}, {
			callee: 'zoneKeylessCertificateUpdate',
			method: 'PATCH',
			path: 'zones/:zone_identifier/keyless_certificates/:identifier',
			required: 'result',
			params: {
				zone_identifier: zone_identifier,
				identifier: identifier
			},
			body: body
		}, raw));
	},

	/**
	 * Delete a keyless certificate from a zone
	 *
	 * https://api.cloudflare.com/#keyless-ssl-for-a-zone-delete-keyless-configuration
	 */
	zoneKeylessCertificateDestroy: function($deferred, zone_identifier, identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required(),
				identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneKeylessCertificateDestroy',
			method: 'DELETE',
			path: 'zones/:zone_identifier/keyless_certificates/:identifier',
			required: 'result',
			params: {
				zone_identifier: zone_identifier,
				identifier: identifier
			},
		}, raw));
	},

	/**
	 * Get a organization
	 *
	 * https://api.cloudflare.com/#organizations-organization-details
	 */
	organizationGet: function ($deferred, organization_identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				organization_identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'organizationGet',
			method: 'GET',
			path: 'organizations/:organization_identifier',
			required: 'result',
			params: {
				organization_identifier: organization_identifier
			}
		}, raw));
	},

	/**
	 * Update a organization
	 *
	 * https://api.cloudflare.com/#organizations-update-organization
	 */
	organizationUpdate: function($deferred, organization_identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				organization_identifier: Joi.string().length(32).required()
			},
			body: Joi.object({
				name: Joi.string().max(100).required()
			}).required()
		}, {
			callee: 'organizationUpdate',
			method: 'PATCH',
			path: 'organizations/:organization_identifier',
			required: 'result',
			params: {
				organization_identifier: organization_identifier
			},
			body: body
		}, raw));
	},

	/**
	 * Get all members for an organization
	 *
	 * https://api.cloudflare.com/#organization-members-list-members
	 */
	organizationMemberGetAll: function ($deferred, organization_identifier, query, raw) {
		$deferred.resolve(this._request({
			params: {
				organization_identifier: Joi.string().length(32).required()
			},
			query: {
				auto_pagination: Joi.boolean()
			}
		}, {
			callee: 'organizationMemberGetAll',
			method: 'GET',
			path: 'organizations/:organization_identifier/members',
			required: 'result',
			params: {
				organization_identifier: organization_identifier
			},
			query: query || {}
		}, raw));
	},

	/**
	 * Get member of an organization
	 *
	 * https://api.cloudflare.com/#organization-members-member-details
	 */
	organizationMemberGet: function ($deferred, organization_identifier, identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				organization_identifier: Joi.string().length(32).required(),
				identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'organizationMemberGet',
			method: 'GET',
			path: 'organizations/:organization_identifier/members/:identifier',
			required: 'result',
			params: {
				organization_identifier: organization_identifier,
				identifier: identifier
			}
		}, raw));
	},

	/**
	 * Update an organizations member roles
	 *
	 * https://api.cloudflare.com/#organization-members-update-member-roles
	 */
	organizationMemberUpdate: function ($deferred, organization_identifier, identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				organization_identifier: Joi.string().length(32).required(),
				identifier: Joi.string().length(32).required()
			},
			body: Joi.object({
				roles: Joi.array().items(
					Joi.object({
						id: Joi.string().length(32).required()
					})
				).min(1).required()
			}).required()
		}, {
			callee: 'organizationMemberUpdate',
			method: 'PATCH',
			path: 'organizations/:organization_identifier/members/:identifier',
			required: 'result',
			params: {
				organization_identifier: organization_identifier,
				identifier: identifier
			},
			body: body || {}
		}, raw));
	},

	/**
	 * Delete an organizations member roles
	 *
	 * https://api.cloudflare.com/#organization-members-remove-member
	 */
	organizationMemberDestroy: function($deferred, organization_identifier, identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				organization_identifier: Joi.string().length(32).required(),
				identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'organizationMemberDestroy',
			method: 'DELETE',
			path: 'organizations/:organization_identifier/members/:identifier',
			required: 'result',
			params: {
				organization_identifier: organization_identifier,
				identifier: identifier
			},
		}, raw));
	},

	/**
	 * Create a organization invitation
	 *
	 * https://api.cloudflare.com/#organization-invites-create-invitation
	 */
	organizationInviteNew: function ($deferred, organization_identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				organization_identifier: Joi.string().length(32).required()
			},
			body: Joi.object({
				invited_member_email: Joi.string().max(90).required(),
				roles: Joi.array().items(
					Joi.object({
						id: Joi.string().length(32).required()
					})
				).min(1).required()
			}).required()
		}, {
			callee: 'organizationInviteNew',
			method: 'POST',
			path: 'organizations/:organization_identifier/invites',
			required: 'result',
			params: {
				organization_identifier: organization_identifier
			},
			body: body
		}, raw));
	},

	/**
	 * Get all organization invitations
	 *
	 * https://api.cloudflare.com/#organization-invites-list-invitations
	 */
	organizationInviteGetAll: function ($deferred, organization_identifier, query, raw) {
		$deferred.resolve(this._request({
			params: {
				organization_identifier: Joi.string().length(32).required()
			},
			query: {
				auto_pagination: Joi.boolean()
			}
		}, {
			callee: 'organizationInviteGetAll',
			method: 'GET',
			path: 'organizations/:organization_identifier/invites',
			required: 'result',
			params: {
				organization_identifier: organization_identifier
			},
			query: query || {}
		}, raw));
	},

	/**
	 * Get an organization invitation
	 *
	 * https://api.cloudflare.com/#organization-invites-invitation-details
	 */
	organizationInviteGet: function ($deferred, organization_identifier, identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				organization_identifier: Joi.string().length(32).required(),
				identifier: Joi.string().length(32).required(),
			}
		}, {
			callee: 'organizationInviteGet',
			method: 'GET',
			path: 'organizations/:organization_identifier/invites/:identifier',
			required: 'result',
			params: {
				organization_identifier: organization_identifier,
				identifier: identifier
			}
		}, raw));
	},

	/**
	 * Update member roles for an organizations invite
	 *
	 * https://api.cloudflare.com/#organization-invites-update-invitation-roles
	 */
	organizationInviteUpdate: function ($deferred, organization_identifier, identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				organization_identifier: Joi.string().length(32).required(),
				identifier: Joi.string().length(32).required()
			},
			body: Joi.object({
				roles: Joi.array().items(
					Joi.object({
						id: Joi.string().length(32).required()
					})
				).min(1).required()
			}).required()
		}, {
			callee: 'organizationInviteUpdate',
			method: 'PATCH',
			path: 'organizations/:organization_identifier/invites/:identifier',
			required: 'result',
			params: {
				organization_identifier: organization_identifier,
				identifier: identifier
			},
			body: body || {}
		}, raw));
	},

	/**
	 * Delete an invitation for an organizations
	 *
	 * https://api.cloudflare.com/#organization-invites-cancel-invitation
	 */
	organizationInviteDestroy: function ($deferred, organization_identifier, identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				organization_identifier: Joi.string().length(32).required(),
				identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'organizationInviteDestroy',
			method: 'DELETE',
			path: 'organizations/:organization_identifier/invites/:identifier',
			required: 'result',
			params: {
				organization_identifier: organization_identifier,
				identifier: identifier
			}
		}, raw));
	},

	/**
	 * Get all organization roles
	 *
	 * https://api.cloudflare.com/#organization-roles-list-roles
	 */
	organizationRoleGetAll: function ($deferred, organization_identifier, query, raw) {
		$deferred.resolve(this._request({
			params: {
				organization_identifier: Joi.string().length(32).required()
			},
			query: {
				auto_pagination: Joi.boolean()
			}
		}, {
			callee: 'organizationRoleGetAll',
			method: 'GET',
			path: 'organizations/:organization_identifier/roles',
			required: 'result',
			params: {
				organization_identifier: organization_identifier
			},
			query: query || {}
		}, raw));
	},

	/**
	 * Get a organization role
	 *
	 * https://api.cloudflare.com/#organization-roles-role-details
	 */
	organizationRoleGet: function ($deferred, organization_identifier, identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				organization_identifier: Joi.string().length(32).required(),
				identifier: Joi.string().length(32).required(),
			}
		}, {
			callee: 'organizationRoleGet',
			method: 'GET',
			path: 'organizations/:organization_identifier/roles/:identifier',
			required: 'result',
			params: {
				organization_identifier: organization_identifier,
				identifier: identifier
			}
		}, raw));
	},

	/**
	 * List firewall access rules for organization
	 *
	 * https://api.cloudflare.com/#organization-level-firewall-access-rule-list-access-rules
	 */
	organizationFirewallAccessRuleGetAll: function ($deferred, organization_identifier, query, raw) {
		$deferred.resolve(this._request({
			params: {
				organization_identifier: Joi.string().length(32).required()
			},
			query: {
				auto_pagination: Joi.boolean(),
				mode: Joi.string().valid('block', 'challenge', 'whitelist'),
				configuration_target: Joi.string().valid('ip', 'ip_range', 'country'),
				configuration_value: Joi.string(),
				order: Joi.string().valid('configuration_target', 'configuration_value', 'mode'),
				direction: Joi.string().valid('asc', 'desc'),
				match: Joi.string().valid('any', 'all')
			}
		}, {
			callee: 'organizationFirewallAccessRuleGetAll',
			method: 'GET',
			path: 'organizations/:organization_identifier/firewall/access_rules/rules',
			required: 'result',
			params: {
				organization_identifier: organization_identifier
			},
			query: query || {}
		}, raw));
	},


	/**
	 * Create firewall access rule for organization
	 *
	 * https://api.cloudflare.com/#organization-level-firewall-access-rule-create-access-rule
	 */
	organizationFirewallAccessRuleNew: function ($deferred, organization_identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				organization_identifier: Joi.string().length(32).required()
			},
			body: Joi.object({
				mode: Joi.string().valid('block', 'challenge', 'whitelist').required(),
				configuration: Joi.object({
					target: Joi.string().valid('ip', 'ip_range', 'country').required(),
					value: Joi.string().required()
				}).required(),
				notes: Joi.string()
			}).required()
		}, {
			callee: 'organizationFirewallAccessRuleNew',
			method: 'POST',
			path: 'organizations/:organization_identifier/firewall/access_rules/rules',
			required: 'result',
			params: {
				organization_identifier: organization_identifier
			},
			body: body
		}, raw));
	},

	/**
	 * Update firewall access rule for organization
	 *
	 * https://api.cloudflare.com/#organization-level-firewall-access-rule-update-access-rule
	 */
	organizationFirewallAccessRuleUpdate: function($deferred, organization_identifier, identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				organization_identifier: Joi.string().length(32).required(),
				identifier: Joi.string().length(32).required()
			},
			body: Joi.object({
				mode: Joi.string().valid('block', 'challenge', 'whitelist').required(),
				configuration: Joi.object({
					target: Joi.string().valid('ip', 'ip_range', 'country').required(),
					value: Joi.string().required()
				}).required(),
				notes: Joi.string()
			}).required()
		}, {
			callee: 'organizationFirewallAccessRuleUpdate',
			method: 'PATCH',
			path: 'organizations/:organization_identifier/firewall/access_rules/rules/:identifier',
			required: 'result',
			params: {
				organization_identifier: organization_identifier,
				identifier: identifier
			},
			body: body
		}, raw));
	},

	/**
	 * Delete firewall access rule for organization
	 *
	 * https://api.cloudflare.com/#organization-level-firewall-access-rule-update-access-rule
	 */
	organizationFirewallAccessRuleDestroy: function($deferred, organization_identifier, identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				organization_identifier: Joi.string().length(32).required(),
				identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'organizationFirewallAccessRuleDestroy',
			method: 'DELETE',
			path: 'organizations/:organization_identifier/firewall/access_rules/rules/:identifier',
			required: 'result',
			params: {
				organization_identifier: organization_identifier,
				identifier: identifier
			},
		}, raw));
	},

	/**
	 * List zone page rules
	 *
	 * https://api.cloudflare.com/#page-rules-for-a-zone-list-page-rules
	 */
	zonePageRulesGetAll: function ($deferred, zone_identifier, query, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			query: {
				auto_pagination: Joi.boolean(),
				order: Joi.string().valid('status', 'priority'),
				direction: Joi.string().valid('asc', 'desc'),
				match: Joi.string().valid('any', 'all')
			}
		}, {
			callee: 'zonePageRulesGetAll',
			method: 'GET',
			path: 'zones/:zone_identifier/pagerules',
			required: 'result',
			params: {
			  zone_identifier: zone_identifier
			},
			query: query || {}
		}, raw));
	},

	/**
	 * Get page rules details
	 *
	 * https://api.cloudflare.com/#page-rules-for-a-zone-page-rule-details
	 */
	zonePageRulesGet: function ($deferred, zone_identifier, identifier, query, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required(),
				identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zonePageRulesGet',
			method: 'GET',
			path: 'zones/:zone_identifier/pagerules/:identifier',
			required: 'result',
			params: {
				zone_identifier: zone_identifier,
				identifier: identifier
			},
			query: query || {}
		}, raw));
	},

	/**
	 * Create a page rule for a zone
	 *
	 * https://api.cloudflare.com/#page-rules-for-a-zone-create-a-page-rule
	 */
	zonePageRulesNew: function ($deferred, zone_identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
			  zone_identifier: Joi.string().length(32).required()
			},
			body: Joi.object({
				targets: Joi.array().items(Joi.object({
				  target: Joi.string().valid('url').required(),
				  constraint: Joi.object({
					  operator: Joi.string().valid('matches').required(),
					  value: Joi.string().required()
				  })
				})).required(),
				actions: Joi.array().items(Joi.object({
				  id: Joi.string(),
				  value: Joi.string()
				})).required(),
				priority: Joi.number(),
				status: Joi.string().valid('active', 'disabled')
			}).required()
		}, {
			callee: 'zonePageRulesNew',
			method: 'POST',
			path: 'zones/:zone_identifier/pagerules',
			required: 'result',
			params: {
			  zone_identifier: zone_identifier
			},
			body: body
		}, raw));
	},

	/**
	 * Update a page rule for a zone
	 *
	 * https://api.cloudflare.com/#page-rules-for-a-zone-update-a-page-rule
	 */
	zonePageRulesUpdate: function ($deferred, zone_identifier, identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
			  zone_identifier: Joi.string().length(32).required(),
			  identifier: Joi.string().length(32).required()
			},
			body: Joi.object({
				targets: Joi.array().items(Joi.object({
				  target: Joi.string().valid('url').required(),
				  constraint: Joi.object({
					  operator: Joi.string().valid('matches').required(),
					  value: Joi.string().required()
				  })
				})).required(),
				actions: Joi.array().items(Joi.object({
				  id: Joi.string(),
				  value: Joi.string()
				})).required(),
				priority: Joi.number(),
				status: Joi.string().valid('active', 'disabled')
			}).required()
		}, {
			callee: 'zonePageRulesUpdate',
			method: 'PUT',
			path: 'zones/:zone_identifier/pagerules/:identifier',
			required: 'result',
			params: {
			  zone_identifier: zone_identifier,
			  identifier: identifier
			},
			body: body
		}, raw));
	},

	/**
	 * Change a page rule for a zone
	 *
	 * https://api.cloudflare.com/#page-rules-for-a-zone-change-a-page-rule
	 */
	zonePageRulesChange: function ($deferred, zone_identifier, identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
			  zone_identifier: Joi.string().length(32).required(),
			  identifier: Joi.string().length(32).required()
			},
			body: Joi.object({
				targets: Joi.array().items(Joi.object({
				  target: Joi.string().valid('url').required(),
				  constraint: Joi.object({
					  operator: Joi.string().valid('matches').required(),
					  value: Joi.string().required()
				  })
				})),
				actions: Joi.array().items(Joi.object({
				  id: Joi.string(),
				  value: Joi.string()
				})),
				priority: Joi.number(),
				status: Joi.string().valid('active', 'disabled')
			}).required()
		}, {
			callee: 'zonePageRulesChange',
			method: 'PATCH',
			path: 'zones/:zone_identifier/pagerules/:identifier',
			required: 'result',
			params: {
			  zone_identifier: zone_identifier,
			  identifier: identifier
			},
			body: body
		}, raw));
	},

	/**
	 * Delete a page rule for a zone
	 *
	 * https://api.cloudflare.com/#page-rules-for-a-zone-delete-a-page-rule
	 */
	zonePageRulesDestroy: function ($deferred, zone_identifier, identifier, raw) {
		$deferred.resolve(this._request({
			params: {
			  zone_identifier: Joi.string().length(32).required(),
			  identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zonePageRulesDestroy',
			method: 'DELETE',
			path: 'zones/:zone_identifier/pagerules/:identifier',
			required: 'result',
			params: {
			  zone_identifier: zone_identifier,
			  identifier: identifier
			}
		}, raw));
	},

    /**
     * Get assigned Routes
     *
     * https://developers.cloudflare.com/workers/api/
     */
    zoneWorkersRoutesGet: function ($deferred, zone_identifier, raw) {
        $deferred.resolve(this._request({
            params: {
                zone_identifier: Joi.string().length(32).required()
            }
        }, {
            callee: 'zoneWorkersRoutesGet',
            method: 'GET',
            path: 'zones/:zone_identifier/workers/filters',
            required: 'result',
            params: {
                zone_identifier: zone_identifier
            }
        }, raw));
    },

    /**
     * Create a route
     *
     * https://developers.cloudflare.com/workers/api/
     */
    zoneWorkersRouteCreate: function ($deferred, zone_identifier, body, raw) {
        $deferred.resolve(this._request({
            params: {
                zone_identifier: Joi.string().length(32).required()
            },
            body: Joi.object({
                pattern: Joi.string().required(),
                enabled: Joi.boolean()
            })
        }, {
            callee: 'zoneWorkersRouteCreate',
            method: 'POST',
            path: 'zones/:zone_identifier/workers/filters',
            required: 'result',
            params: {
                zone_identifier: zone_identifier
            },
            body: body
        }, raw));
    },

    /**
     * Delete a route
     *
     * https://developers.cloudflare.com/workers/api/
     */
    zoneWorkersRouteDelete: function ($deferred, zone_identifier, route_identifier, raw) {
        $deferred.resolve(this._request({
            params: {
                zone_identifier: Joi.string().length(32).required(),
                route_identifier: Joi.string().required()
            }
        }, {
            callee: 'zoneWorkersRouteDelete',
            method: 'DELETE',
            path: 'zones/:zone_identifier/workers/filters/:route_identifier',
            required: 'result',
            params: {
                zone_identifier: zone_identifier,
                route_identifier: route_identifier
            }
        }, raw));
    },

    /**
     * Update a route (enable / disable)
     *
     * https://developers.cloudflare.com/workers/api/
     */
    zoneWorkersRouteUpdate: function ($deferred, zone_identifier, route_identifier, body, raw) {
        $deferred.resolve(this._request({
            params: {
                zone_identifier: Joi.string().length(32).required(),
                route_identifier: Joi.string().required()
            },
            body: Joi.object({
                pattern: Joi.string().required(),
                enabled: Joi.boolean().required()
            }).required()
        }, {
            callee: 'zoneWorkersRouteUpdate',
            method: 'PUT',
            path: 'zones/:zone_identifier/workers/filters/:route_identifier',
            required: 'result',
            params: {
                zone_identifier: zone_identifier,
                route_identifier: route_identifier
            },
            body: body
        }, raw));
    }

});

module.exports = CloudFlare;