const path = require('path'); 

const common_tests_for_all = () => {
  
  console.log(`!!! BEGIN: "${path.basename(__filename)}" !!!`);
    
  test(`"Content-Type" or "content-type" is present`, async () => {
    expect(res.getHeaders()).to.include.any.keys("Content-Type", "content-type");
  });

  /*
  test(`"Content-Type" is "application/json" or "application/json; charset=UTF-8"`, async () => { 
    expect(res.getHeader('Content-Type')).to.be.oneOf(['application/json', 'application/json; charset=UTF-8']);
  });
  */

  /*
  test(`"content-type" is "application/json" or "application/json; charset=UTF-8"`, async () => { 
    expect(res.getHeader('content-type')).to.be.oneOf(['application/json', 'application/json; charset=UTF-8']);
  });
  */

  test(`"Content-Type" or "content-type" is "application/json" or "application/json; charset=UTF-8"`, async () => { 
    const contentType = res.getHeader('content-type') || res.getHeader('Content-Type');
    expect(contentType).to.be.oneOf(['application/json', 'application/json; charset=UTF-8']);
  });

  test('Response time is less than "10" seconds', function () {
    expect(res.responseTime).to.be.below(10000);
  });

  console.log(`!!! END: "${path.basename(__filename)}" !!!`);

}

module.exports = {
  common_tests_for_all
}



