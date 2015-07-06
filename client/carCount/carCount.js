Template.carCount.helpers({
	'count' : function(){
		return CarList.find().count()
	}	
});