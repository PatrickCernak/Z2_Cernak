jQuery(document).ready(function($) {
	
});

function rm_newsletter_signup(email, callback) {
	jQuery.post(rm_data.ajax_url, {'action' : 'newsletter_signup', 'email' : email}, callback, "json");
}

function rm_newsletter_optout(email, callback) {
	jQuery.post(rm_data.ajax_url, {'action':'newsletter_optout', 'email':email}, callback, "json");
}