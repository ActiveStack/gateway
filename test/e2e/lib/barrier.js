'use strict';

module.exports = barrier;

function barrier(count, callback) {
	var calledCount = 0;

	return function() {
		if (count == ++calledCount) {
			callback();
		} else if (count < calledCount) {
			throw new Error('Barrier called more times than expected.');
		}
	};
}
