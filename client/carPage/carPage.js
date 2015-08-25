Router.route('/car/:_id', {
    name: 'singleCarPage',
    template: 'carPage',
    data: function() {
        var currentUserId = Meteor.userId();
        var currentCar = this.params._id;
        return CarList.findOne({
            _id: currentCar
        });
    }
});
