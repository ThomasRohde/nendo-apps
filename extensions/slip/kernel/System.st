"Slip kernel: the system dictionary Smalltalk, Time and Random."!

!SystemDictionary methodsFor: 'accessing'!
at: aKey
	^self at: aKey ifAbsent: [self error: 'There is no global named ', aKey]
!
at: aKey ifAbsent: aBlock
	<primitive: 'globalAt'>
	^aBlock value
!
at: aKey put: anObject
	<primitive: 'globalAtPut'>
	^self error: aKey printString, ' cannot be the name of a global'
!
includesKey: aKey
	<primitive: 'globalIncludes'>
	^false
!
keys
	<primitive: 'globalKeys'>
	^#()
!
allClasses
	<primitive: 'allClasses'>
	^#()
!
classNamed: aString
	^self at: aString asSymbol ifAbsent: [nil]
!
version
	^'Slip 0.5'
! !

!SystemDictionary methodsFor: 'printing'!
printOn: aStream
	aStream nextPutAll: 'Smalltalk'
! !

!Time class methodsFor: 'timing'!
millisecondClockValue
	<primitive: 'millis'>
	^0
!
millisecondsToRun: aBlock
	| start |
	start := self millisecondClockValue.
	aBlock value.
	^self millisecondClockValue - start
! !

!Random class methodsFor: 'instance creation'!
new
	^self basicNew
! !

!Random methodsFor: 'accessing'!
next
	<primitive: 'random'>
	^0.5
!
between: low and: high
	^low + (self next * (high - low + 1)) truncated
! !
