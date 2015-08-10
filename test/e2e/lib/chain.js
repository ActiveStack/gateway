'use strict';

module.exports = chain;

function chain(links) {
	function getNext() {
		var nextLink = links.shift();
		var called = false;

		return function() {
			if (called) {
				throw new Error('Chain link may only be followed once.');
			}
			called = true;

			var args = Array.prototype.slice.call(arguments, 0);
			args.unshift(getNext());
			nextLink.apply(this, args);
		}
	}

	getNext()();
}
