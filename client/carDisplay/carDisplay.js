Template.carDisplay.helpers({
	'toynum' : function(){
		return CarList.find()
	},
	'model' : function(){
		return CarList.find()
	},
	'series' : function(){
		return CarList.find()
	},
	'color' : function(){
		return CarList.find()
	},
	'year' : function(){
		return CarList.find()
	},
	'seriesNum' : function(){
		return CarList.find()
	},
	'collector' : function(){
		return CarList.find()
	},		
	'fav' : function(){
		return CarList.find()
	},
	'notes' : function(){
		return CarList.find()
	},
	'imgurl' : function(){
		return CarList.find()
	}
});

Template.carDisplay.events({
	'click .remove': function(){
		var carID = this._id;
		Session.set('selectedCar', carID);
		console.log(carID);

		if (confirm('Do you really want to delete this car?')) {
			var selectedCar = Session.get('selectedCar');
			CarList.remove(selectedCar);
			console.log('User deleted ' + selectedCar);
		} else {
			console.log('User did cancelled removal of ' + carID);
		}
	}
});

Template.carDisplay.helpers({
  CarList: function () {
    // Show newest tasks first
    return CarList.find({}, {sort: {createdAt: -1}});
  }
});