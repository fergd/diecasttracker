Router.route('/car/:_id', {
    name: 'singleCarPage',
    template: 'carPage',
    data: function() {
        var currentCar = this.params._id;
	    return CarList.findOne({_id: currentCar});
    }
});

Template.carPage.onRendered = function () {
	console.log('during');
	this.$( '.toy-info span:empty' ).each( function () {
	  	$( this ).closest( '.toy-info' ).remove();
	});
	console.log('after');
}