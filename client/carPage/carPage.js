// Router.route('/car/:_id._str', {
//     name: 'singleCarPage',
//     template: 'carPage',
//     data: function() {
//         var currentCar = this.params._id._str;
//         return CarList.findOne({_id: currentCar});
//         //return CarList.findOne({_id: Meteor.Collection.ObjectID(currentCar)});
//     }
// });
Router.route('/car/:_id._str', {
    name: 'singleCarPage',
    template: 'carPage',
    data: function() {
        var currentCar = ObjectID(this.params._id);
        return CarList.findOne({_id: currentCar});
    }
});

// News.findOne({_id: new Meteor.Collection.ObjectID(this.params._id)});