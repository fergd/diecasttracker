CarList = new Mongo.Collection('cars');

CarList.initEasySearch(['dc_toy_num', 'dc_model_name'], {
    'limit' : 20,
    'use' : 'mongo-db'
});

if (Meteor.isClient) {
	// console.log('Greetings, user.');

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
		}
	});

	Template.carCount.helpers({
		'count' : function(){
			return CarList.find().count()
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

	Template.addCarForm.events({
		'submit form' : function(event,template){
			event.preventDefault();

			var toyNumVar = event.target.dc_toy_num.value;
			var modelNameVar = event.target.dc_model_name.value;
			var seriesVar = event.target.dc_series.value;
			var colorVar = event.target.dc_color.value;
			var yearVar = event.target.dc_year.value;
			var seriesNumVar = event.target.dc_series_num.value;
			var collectorNumVar = event.target.dc_collector_num.value;
			var favouriteVar = event.target.dc_favourite.value;
			var notesVar = event.target.dc_notes.value;

			CarList.insert({
				dc_toy_num: toyNumVar,
				dc_model_name: modelNameVar,
				dc_series: seriesVar,
				dc_color: colorVar,
				dc_year: yearVar,
				dc_series_num: seriesNumVar,
				dc_collector_num: collectorNumVar,
				dc_favourite: favouriteVar,
				dc_notes: notesVar
			});
			template.find("form").reset();
			console.log('form reset');
		}
	});
}

if (Meteor.isServer) {
	Meteor.startup(function () {
		// console.log('Greetings, CLU.');
	});
}