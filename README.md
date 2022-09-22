# imageguessr
A react-native application which leverages tensorflow.js and the Google Translate API to identify objects surrounding the user, and challenges them to guess their definition in another language. 

Every time a user selects to point their camera at an object, the application will retrieve the word for that based on the TensorFlow.js image classification model (translation will only appear once model has 70%+ conviction the item is the corresponding object). The user can then guess what that word is in English. 

The benefit here is two-fold: the user is able to identify unknown objects, and also learn the language of their suiting.

Over 10+ languages are available for selection, and the user has infinite tries to guess what the item is.


Demo:

https://user-images.githubusercontent.com/88706651/191717306-990c948d-64b2-4743-97e6-50befeb23fe3.mov

