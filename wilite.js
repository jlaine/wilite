var connection = new Strophe.Connection(WILITE_BOSH_URL);
connection.connected = false;
connection.initialised = false;
connection.stanzaId = function() {
    if (this.stanzaCounter)
        this.stanzaCounter += 1;
    else
        this.stanzaCounter = 1;
    return 'zob_' + this.stanzaCounter;
}
connection.ownName = 'Me';
connection.ownPhoto = 'peer.png';

var scrollTimer;

function pad(n, l) {
    var str = '' + n;
    while (str.length < l)
        str = '0' + str;
    return str;
}

/** Formats a date for display.
 */
function formatDate(d)
{
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return pad(d.getDate(), 2)
        + ' ' + months[d.getMonth()]
        + ' ' + pad(d.getHours(), 2)
        + ':' + pad(d.getMinutes(), 2);
}

/** Parses a date in the form: 2012-03-20T12:08:59Z
 */
function parseDate(stamp)
{
    var date = new Date();
    date.setUTCFullYear(stamp.slice(0, 4));
    date.setUTCMonth(stamp.slice(5, 7) - 1); // NOTE : month is 0-11 in JS
    date.setUTCDate(stamp.slice(8, 10));
    date.setUTCHours(stamp.slice(11, 13));
    date.setUTCMinutes(stamp.slice(14, 16));
    date.setUTCSeconds(stamp.slice(17, 19));
    return date;
}

/** Serializes a date in the form: 2012-03-20T12:08:59Z
 */
function serializeDate(date)
{
    return pad(date.getUTCFullYear(), 4)
        + '-' + pad(date.getUTCMonth() + 1, 2)
        + '-' + pad(date.getUTCDate(), 2)
        + 'T' + pad(date.getUTCHours(), 2)
        + ':' + pad(date.getUTCMinutes(), 2)
        + ':' + pad(date.getUTCSeconds(), 2)
        + 'Z';
}

/** Parses page parameters.
    Copyright (c) 2011, Kin Blas
*/
function queryStringToObject( qstr )
{
	var result = {},
		nvPairs = ( ( qstr || "" ).replace( /^\?/, "" ).split( /&/ ) ),
		i, pair, n, v;

	for ( i = 0; i < nvPairs.length; i++ ) {
		var pstr = nvPairs[ i ];
		if ( pstr ) {
			pair = pstr.split( /=/ );
			n = pair[ 0 ];
			v = pair[ 1 ];
			if ( result[ n ] === undefined ) {
				result[ n ] = v;
			} else {
				if ( typeof result[ n ] !== "object" ) {
					result[ n ] = [ result[ n ] ];
				}
				result[ n ].push( v );
			}
		}
	}

	return result;
}

function addContact(contact) {
    var roster = $('#contact-list');
    var inserted = false;
    var newValue = contact.find('.contact-name').text().toLowerCase();
    roster.find('li').each(function() {
        var current = $(this);
        var curValue = current.find('.contact-name').text().toLowerCase();
        if (newValue < curValue) {
            contact.insertBefore(current);
            inserted = true;
            return false;
        }
    });
    if (!inserted)
        roster.append(contact);
}

// find the DOM node for the given contact
function findContact(jid) {
    return $('#contact-list li[data-jid="' + jid + '"]');
}

// request vCard
function updateContact(contact) {
    var jid = contact.attr('data-jid');
    var iq = $iq({to: jid, id: connection.stanzaId(), type: 'get'}).c('vCard', {xmlns: 'vcard-temp'});
    connection.sendIQ(iq.tree(), function(stanza) {
        var vcard = $(stanza).find('vCard');

        // set photo
        var photo = vcard.find('PHOTO');
        if (photo.length == 1) {
            var photoData = photo.find('BINVAL').text();
            var photoType = photo.find('TYPE').text();
            var photoUri = 'data:' + photoType + ';base64,' + photoData;
            contact.find('.contact-photo').attr('src', photoUri);
            
            // cache photo
            localStorage.setItem('contact/' + jid + '/photo', photoUri);
        }

        // set name
        var name = vcard.find("NICKNAME").text();
        if (name) {
            if (contact.attr('data-name-final') != 'true') {
                contact.find('.contact-name').text(name);
                contact.remove();
                addContact(contact);
            }

            // cache nickname
            localStorage.setItem('contact/' + jid + '/name', name);
        }
    });
}

function addMessage(page, body, date, jid) {
    var name = 'Unknown';
    var photo = 'peer.png';
    if (jid == connection.ownJid) {
        name = connection.ownName;
        photo = connection.ownPhoto;
    } else {
        var contact = findContact(jid);
        name = contact.find('.contact-name').text();
        photo = contact.find('.contact-photo').attr('src');
    }

    var messages = page.find('.message-list');
    if (messages.find('li:last').attr('data-jid') != jid) {
        messages.append('<li data-role="list-divider">'
            + '<img class="contact-photo" src="' + photo + '"/>'
            + '<span class="contact-name">' + name + '</span>'
            + '<span class="message-date">' + formatDate(date) + '</span>'
            + '</li>');
    }
    messages.append('<li data-jid="' + jid + '">' + body + '</li>');
    messages.listview('refresh');
    page.find('.message-empty').hide();

    if (scrollTimer) clearTimeout(scrollTimer);
    scrollTimer = window.setTimeout('$("html").animate({ scrollTop: $(document).height() })', 200);
}

/** Clears message history.
 */
function clearMessages(page) {
    page.find('.message-list').html('');
    page.find('.message-empty').show();
}

/** Fetches messages history.
 */
function fetchMessages(page, jid) {
    clearMessages(page);
    var start = new Date((new Date()).valueOf() - 365 * 24 * 3600 * 1000);
    var iq = $iq({id: connection.stanzaId(), type: 'get'})
        .c('list', {with: jid, start: serializeDate(start), xmlns: 'urn:xmpp:archive'})
            .c('set', {xmlns: 'http://jabber.org/protocol/rsm'})
                .c('before').up()
                .c('max', {}, '2');
    connection.sendIQ(iq.tree(), function(stanza) {
        $(stanza).find('list chat').each(function() {
            var chat = $(this);
            var iq = $iq({id: connection.stanzaId(), type: 'get'})
                .c('retrieve', {with: chat.attr('with'), start: chat.attr('start'), xmlns: 'urn:xmpp:archive'})
                    .c('set', {xmlns: 'http://jabber.org/protocol/rsm'});
            connection.sendIQ(iq.tree(), function(stanza) {
                var chat = $(stanza).find('chat');
                var date = parseDate(chat.attr('start'));
                chat.children().each(function() {
                    var msg = $(this);
                    var body = msg.find('body').text();
                    date = new Date(date.valueOf() + 1000 * parseInt(msg.attr('secs')));
                    if (this.nodeName == 'to') {
                        addMessage(page, body, date, connection.ownJid);
                    } else if (this.nodeName == 'from') {
                        addMessage(page, body, date, chat.attr('with'));
                    }
                });
            });
        });
    });
}

/** Handles an incoming message.
 */
function onMessage(stanza) {
    var message = $(stanza);

    var body = message.find('body').text();
    var jid = Strophe.getBareJidFromJid(message.attr('from'));
    if (body) {
        // handle date
        var date = new Date();
        var x = message.find('x');
        if (x.length > 0) {
            var stamp = x.attr('stamp');
            date.setUTCFullYear(stamp.slice(0, 4));
            date.setUTCMonth(stamp.slice(4, 6) - 1); // NOTE : month is 0-11 in JS
            date.setUTCDate(stamp.slice(6, 8));
            date.setUTCHours(stamp.slice(9, 11));
            date.setUTCMinutes(stamp.slice(12, 14));
            date.setUTCSeconds(stamp.slice(15, 17));
        }

        var talk_page = $('#talk-page');
        if (talk_page.attr('data-jid') == jid) {
            // talk page is open, add message
            addMessage(talk_page, body, date, jid);
        } else {
            // talk page is closed, make a note of missed message
            var contact = findContact(jid);
            var messages = contact.find('.contact-messages');
            messages.text(parseInt(messages.text()) + 1);
            messages.show();
        }
    }
    return true;
}

/** Handles an incoming XEP-0199 ping.
 */
function onPing(ping) {
    var iq = $(stanza);

    // send reply
    var pong = $iq({to: iq.attr('from'), id: iq.attr('id'), type: 'result'});
    connection.send(pong.tree());

    return true;
}

/** Handles an incoming presence.
 */
function onPresence(stanza) {
    var presence = $(stanza);
    var roster = $('#contact-list');
    var jid = Strophe.getBareJidFromJid(presence.attr('from'));
    var contact = findContact(jid);

    var type = presence.attr('type');
    if (type == 'unavailable') {
        contact.attr('data-status', 'offline');
    } else {
        var stat = 'available';
        var show = presence.find('show').text();
        if (show == 'dnd')
            stat = 'busy';
        else if (show == 'away' || show == 'xa')
            stat = 'away';
        contact.attr('data-status', stat);
        if (roster.hasClass('ui-listview'))
            roster.listview('refresh');
    }

    return true;
}

function doConnect(username, password) {
    connection.ownJid = username + '@' + WILITE_DOMAIN + '/js';
    connection.connect(connection.ownJid, password, function(status) {
        var ownContact = $('.own-contact');
        var statusZone = ownContact.find('.connection-state')
        if (status == Strophe.Status.CONNECTING) {
            statusZone.html('Connecting..');
        } else if (status == Strophe.Status.CONNFAIL) {
            statusZone.html('Failed to connect.');
        } else if (status == Strophe.Status.DISCONNECTING) {
            statusZone.html('Disconnecting..');
        } else if (status == Strophe.Status.DISCONNECTED) {
            connection.connected = false;
            statusZone.html('Disconnected.');
            ownContact.attr('data-status', 'offline');
        } else if (status == Strophe.Status.CONNECTED) {
            connection.connected = true;
            statusZone.html('Connected.');
            ownContact.attr('data-status', 'available');

            // save credentials
            localStorage.setItem("username", username);
            localStorage.setItem("password", password);

            // setup handlers
            connection.addHandler(onMessage, null, 'message', null, null,  null);
            connection.addHandler(onPing, 'urn:xmpp:ping', 'iq', 'get', null,  null);
            connection.addHandler(onPresence, null, 'presence', null, null,  null);

            // request roster
            var iq = $iq({type: 'get', id: connection.stanzaId()}).c('query', {xmlns: 'jabber:iq:roster'});
            connection.sendIQ(iq.tree(), function(stanza) {
                var iq = $(stanza);
                var roster = $('#contact-list');
                iq.find('item').each(function() {
                    var jid = $(this).attr('jid');
                    var name = $(this).attr('name');
                    var nameFinal = false;
                    if (name)
                        nameFinal = true;
                    else
                        name = Strophe.getNodeFromJid(jid);

                    // fetch cached info
                    var needCard = false;
                    var photo = localStorage.getItem('contact/' + jid + '/photo');
                    if (!photo) {
                        photo = 'peer.png';
                        needCard = true;
                    }

                    var name = $(this).attr('name');
                    var nameFinal = (name && name.length > 0);
                    if (!name)
                        name = localStorage.getItem('contact/' + jid + '/name');
                    if (!name) {
                        name = Strophe.getNodeFromJid(jid);
                        needCard = true;
                    }

                    // insert contact
                    addContact($('<li data-jid="' + jid +'" data-name-final="' + nameFinal + '" data-status="offline"><a href="#talk-page?jid=' + jid + '">'
                        + '<img class="contact-photo" src="' + photo + '"/>'
                        + '<span class="contact-name">' + name + '</span>'
                        + '<span class="contact-messages ui-li-count" style="display:none">0</span>'
                        + '<span class="contact-status"></span>'
                        + '</a></li>'));

                    // request vcard if needed
                    if (needCard) {
                        var contact = roster.find('li[data-jid="' + jid + '"]');
                        updateContact(contact);
                    }
                });
                if (roster.hasClass('ui-listview'))
                    roster.listview('refresh');
                $('#contact-empty').hide();
            });

            // send initial presence
            connection.send($pres().tree());

            // request own vCard
            iq = $iq({id: connection.stanzaId(), type: 'get'}).c('vCard', {xmlns: 'vcard-temp'});
            connection.sendIQ(iq.tree(), function(stanza) {
                var vcard = $(stanza).find('vCard');

                // set photo
                var photo = vcard.find('PHOTO');
                if (photo.length == 1) {
                    var photoData = photo.find('BINVAL').text();
                    var photoType = photo.find('TYPE').text();
                    connection.ownPhoto = 'data:' + photoType + ';base64,' + photoData;
                }

                // set name
                var nickName = vcard.find("NICKNAME");
                if (nickName.length == 1) {
                    connection.ownName = nickName.text();
                }
            });

            var page = $('#talk-page');
            var jid = page.attr('data-jid');
            if (jid)
                fetchMessages(page, jid);
        }
    });
}

function doInit() {
    if (connection.initialized == true)
        return;
    connection.initialized = true;

    var username = localStorage.getItem("username");
    var password = localStorage.getItem("password");
    if (username && password) {
        doConnect(username, password);
    } else {
        $.mobile.changePage('#connect-page');
    }
}

var firstChange = true;

$( document ).bind( "pagebeforechange", function( e, data ) {
    // hijack initial location
    if (firstChange) {
        if (window.location.hash)
            data.toPage = window.location.hash;
        firstChange = false;
    }

	// get page data
	if ( typeof data.toPage === "string" ) {
		var u = $.mobile.path.parseUrl( data.toPage );
		if ( $.mobile.path.isEmbeddedPage( u ) ) {

			var u2 = $.mobile.path.parseUrl( u.hash.replace( /^#/, "" ) );
			if ( u2.search ) {
				if ( !data.options.dataUrl ) {
					data.options.dataUrl = data.toPage;
				}
				$.mobile.pageData = queryStringToObject( u2.search );
				data.toPage = u.hrefNoHash + "#" + u2.pathname;
			}
		}
	}
});

// 1. CONNECT PAGE

$(document).delegate("#connect-page", "pageinit", function() {
    var page = $('#connect-page');
    var button = page.find('#connect-submit');
    button.click(function() {
        var username = page.find('#username').val();
        var password = page.find('#password').val();
        if (username.indexOf('@') >= 0) {
            page.find('#username').val(username.substr(0, username.indexOf('@')));
        } else if (username && password) {
            doConnect(username, password);
            $.mobile.changePage('#contact-page');
        }
    });
    page.keypress(function(e) {
        if (e.keyCode == 13) {
            button.click();
        }
    });
});

$(document).delegate('#connect-page', 'pageshow', function() {
    $('#connect-page #username').focus();
});

// 2. CONTACT PAGE

$(document).delegate('#contact-page', 'pageinit', function() {
    // run init
    doInit();
});

// 3. TALK PAGE

$(document).delegate('#talk-page', 'pageinit', function() {
    var page = $('#talk-page');
    var button = page.find('.message-submit');
    var input = page.find('.message-input');
    button.click(function() {
        var body = input.val();
        if (!body)
            return;

        // send message
        var message = $msg({to: page.attr('data-jid'), type: 'chat'}).c('body', {}, body);
        connection.send(message.tree());

        // add message to history
        addMessage(page, body, new Date(), connection.ownJid);

        // give focus back to input
        input.val('');
        input.focus();
    });
    page.keypress(function(e) {
        if (e.keyCode == 13) {
            button.click();
        }
    });

    // run init
    doInit();
});

$(document).delegate('#talk-page', 'pageshow', function() {
    var jid = $.mobile.pageData.jid;
    var page = $('#talk-page');

    // clear missed messages
    var contact = findContact(jid);
    var messages = contact.find('.contact-messages');
    messages.hide();
    messages.text('0');

    if (page.attr('data-jid') != jid) {
        // FIXME: we need to be able to do this before connecting
        var name = contact.find('.contact-name').text();
        page.find('h1').text('Talking with ' + name);
        page.attr('data-jid', jid);

        // retrieve message history
        if (connection.connected)
            fetchMessages(page, jid);
    }

    $(window).resize();
    page.find('.message-input').focus();
});

// 4. LOGOUT PAGE

$(document).delegate('#logout-page', 'pageshow', function() {
    $('#contact-list').html('');
    $('#contact-empty').show();
    clearMessages($('#talk-page'));
    connection.disconnect();
    localStorage.clear();
});

// handle window resize
$(window).resize(function() {
    $('.message-input').width($('#talk-page').innerWidth() - 100);
});

